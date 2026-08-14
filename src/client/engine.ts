/**
 * The in-conversation search engine, built on the CSS Custom Highlight API.
 *
 * Why the Highlight API and not injected <mark> elements: the transcript DOM
 * is owned by React and is continuously re-rendered while the model streams.
 * Wrapping matches in <mark> nodes would mutate React-managed text nodes and
 * fight reconciliation. The Custom Highlight API paints ranges as an overlay
 * without touching the DOM tree, so it survives every re-render and needs no
 * cleanup of React's children.
 *
 * Scope discipline: matching only walks the conversation scrollport
 * (`[data-conversation-scroll]`) and skips the composer seat and this
 * plugin's own floating bar, so a query matching UI chrome or the user's own
 * draft never produces phantom hits.
 *
 * No cordis, no React — pure DOM helpers, unit-testable against jsdom.
 */

/** Highlight name for every match. */
export const HL_ALL = 'dsh-conv-search'
/** Highlight name for the single active (focused) match. */
export const HL_ACTIVE = 'dsh-conv-search-active'
/** Selector of the conversation scrollport the engine operates within. */
export const SCROLL_SELECTOR = '[data-conversation-scroll]'
/** Selector of the composer seat excluded from matching. */
export const COMPOSER_SELECTOR = '[data-composer-seat]'
/** Selector of this plugin's floating bar, excluded from matching. */
export const BAR_SELECTOR = '[data-dsh-conv-search-bar]'

/** A located match: its range plus enough identity to scroll to it. */
export interface MatchRange {
  /** The highlighted text range (start container is a text node). */
  readonly range: Range
}

/** Matching behavior toggles, mirroring the browser/IDE find bar. */
export interface MatchOptions {
  /** Match letter case exactly (off = case-insensitive, the default). */
  readonly caseSensitive: boolean
  /** Only match occurrences bounded by non-word characters. */
  readonly wholeWord: boolean
}

/** The default matching behavior: case-insensitive substring. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  caseSensitive: false,
  wholeWord: false,
}

/** The result of one search pass over the rendered transcript. */
export interface SearchResult {
  /** Every match in document order. */
  readonly matches: readonly MatchRange[]
  /** Total match count (matches.length). */
  readonly total: number
}

/**
 * Feature-detect the CSS Custom Highlight API.
 * @returns true when the runtime can paint highlights.
 */
export function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined'
    && typeof (CSS as unknown as { highlights?: unknown }).highlights !== 'undefined'
}

/**
 * Resolve the conversation scrollport from anywhere in the document.
 * @param from - any element or the document itself.
 * @returns the scrollport element, or null when no conversation is rendered.
 */
export function resolveScope(from: ParentNode = document): HTMLElement | null {
  return from.querySelector<HTMLElement>(SCROLL_SELECTOR)
}

/**
 * Collect the candidate text nodes inside the scope: everything except the
 * composer seat, the plugin bar, and non-rendered script/style content.
 * @param scope - the conversation scrollport.
 * @returns the live text nodes to scan, in document order.
 */
function collectTextNodes(scope: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const text = node.nodeValue ?? ''
      if (text.trim() === '') return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (parent === null) return NodeFilter.FILTER_REJECT
      if (parent.closest(`${COMPOSER_SELECTOR}, ${BAR_SELECTOR}, script, style`) !== null) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let current = walker.nextNode()
  while (current !== null) {
    out.push(current as Text)
    current = walker.nextNode()
  }
  return out
}

/**
 * Whether a character counts as a word character for whole-word boundaries:
 * letters (any script, including CJK), digits, and underscore.
 * @param ch - a single character ('' at the text edges).
 * @returns true when the character continues a word.
 */
function isWordChar(ch: string): boolean {
  if (ch === '') return false
  return /^[\p{L}\p{N}_]$/u.test(ch)
}

/**
 * Whole-word boundary check: a match is whole when no word character sits
 * directly beside a word-character edge of the query. Query edges that are
 * themselves non-word characters impose no boundary requirement.
 * @param text - the scanned text (same casing as the needle).
 * @param idx - match start offset.
 * @param end - match end offset.
 * @param needle - the query string.
 * @returns true when the occurrence stands alone.
 */
function wholeWordOk(text: string, idx: number, end: number, needle: string): boolean {
  const before = idx > 0 ? text.charAt(idx - 1) : ''
  const after = end < text.length ? text.charAt(end) : ''
  if (isWordChar(needle.charAt(0)) && isWordChar(before)) return false
  if (isWordChar(needle.charAt(needle.length - 1)) && isWordChar(after)) return false
  return true
}

/**
 * Find every occurrence of the query across the scope's text nodes and return
 * them as ranges in document order.
 * @param scope - the conversation scrollport.
 * @param query - the raw query (already trimmed, non-empty).
 * @param options - matching behavior (case sensitivity, whole word).
 * @returns the located matches.
 */
export function findMatches(
  scope: HTMLElement,
  query: string,
  options: MatchOptions = DEFAULT_MATCH_OPTIONS,
): SearchResult {
  const needle = options.caseSensitive ? query : query.toLowerCase()
  const matches: MatchRange[] = []
  if (needle === '') return { matches, total: 0 }

  for (const node of collectTextNodes(scope)) {
    const text = node.data
    const hay = options.caseSensitive ? text : text.toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      const end = idx + needle.length
      if (!options.wholeWord || wholeWordOk(hay, idx, end, needle)) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, end)
        matches.push({ range })
      }
      idx = hay.indexOf(needle, end)
    }
  }
  return { matches, total: matches.length }
}

/** Access the highlight registry, or undefined when unsupported. */
function registry(): HighlightRegistry | undefined {
  if (!highlightsSupported()) return undefined
  return (CSS as unknown as { highlights: HighlightRegistry }).highlights
}

/**
 * Paint the located matches: every match under {@link HL_ALL}, and the active
 * one additionally under {@link HL_ACTIVE}. Replaces any previous paint.
 * @param result - the matches to paint.
 * @param activeIndex - the focused match index, or -1 for none.
 */
export function paint(result: SearchResult, activeIndex: number): void {
  const reg = registry()
  if (reg === undefined) return
  const all = new Highlight(...result.matches.map(m => m.range))
  reg.set(HL_ALL, all)
  const activeRange = result.matches[activeIndex]?.range
  if (activeRange !== undefined) {
    reg.set(HL_ACTIVE, new Highlight(activeRange))
  } else {
    reg.delete(HL_ACTIVE)
  }
}

/**
 * Remove every highlight this plugin painted. Idempotent.
 */
export function clearPaint(): void {
  const reg = registry()
  if (reg === undefined) return
  reg.delete(HL_ALL)
  reg.delete(HL_ACTIVE)
}

/**
 * Scroll the active match into view. Runtimes without Range geometry (some
 * test environments) degrade to a no-op.
 * @param result - the current matches.
 * @param index - the match index to focus.
 */
export function scrollToMatch(result: SearchResult, index: number): void {
  const target = result.matches[index]
  if (target === undefined) return
  if (typeof target.range.getBoundingClientRect !== 'function') return
  const rect = target.range.getBoundingClientRect()
  const scrollport = resolveScope()
  if (scrollport === null) return
  const portRect = scrollport.getBoundingClientRect()
  const delta = rect.top - portRect.top - (scrollport.clientHeight / 2) + (rect.height / 2)
  scrollport.scrollBy({ top: delta, behavior: 'smooth' })
}
