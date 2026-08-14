/**
 * The search controller: owns the floating bar (plain DOM — no React, so the
 * bar never couples to the shell's React version), the engine passes, and the
 * transcript mutation watch that keeps highlights honest while the model
 * streams or older pages load.
 *
 * Lifecycle: `install()` from the cordis apply (document-level key capture +
 * bar mount), `uninstall()` on plugin unload. Everything between is driven by
 * user input and DOM observation.
 */
import {
  clearPaint, findMatches, paint, resolveScope, scrollToMatch,
  DEFAULT_MATCH_OPTIONS,
  type MatchOptions, type SearchResult,
} from './engine.ts'
import { adoptStyles } from './styles.ts'
import { fmt, t } from './i18n.ts'

/** Debounce for input-driven re-searches (ms). */
const SEARCH_DEBOUNCE_MS = 120
/** Debounce for mutation-driven re-searches (ms). */
const MUTATION_DEBOUNCE_MS = 160
/** Upper bound of the in-memory query history. */
const HISTORY_LIMIT = 20

/** The controller's mutable runtime state. */
interface ControllerState {
  /** Whether the bar is open. */
  open: boolean
  /** The current query (the input's live value). */
  query: string
  /** Matching behavior toggles (case / whole word). */
  options: MatchOptions
  /** The last search pass result. */
  result: SearchResult
  /** Active match index; -1 = none. */
  index: number
}

/** Identity of the active match, used to survive transcript mutations. */
interface MatchAnchor {
  /** The text node the active match starts in. */
  readonly container: Node
  /** The start offset inside that node. */
  readonly offset: number
}

/**
 * The singleton controller. A page hosts exactly one conversation pane, so a
 * module-level instance is the right ownership; cordis install/uninstall
 * bracket its DOM effects.
 */
class SearchController {
  private state: ControllerState = {
    open: false,
    query: '',
    options: DEFAULT_MATCH_OPTIONS,
    result: { matches: [], total: 0 },
    index: -1,
  }

  private bar: HTMLElement | null = null
  private input: HTMLInputElement | null = null
  private countEl: HTMLElement | null = null
  private prevBtn: HTMLButtonElement | null = null
  private nextBtn: HTMLButtonElement | null = null
  private caseBtn: HTMLButtonElement | null = null
  private wordBtn: HTMLButtonElement | null = null

  private searchTimer: ReturnType<typeof setTimeout> | undefined
  private mutationTimer: ReturnType<typeof setTimeout> | undefined
  private observer: MutationObserver | null = null
  private observedScope: HTMLElement | null = null
  private installed = false

  /** In-memory query history (most recent first), capped at HISTORY_LIMIT. */
  private history: string[] = []
  /** Cursor into history while ArrowUp/ArrowDown is held; -1 = not browsing. */
  private historyCursor = -1
  /** The input value parked before history browsing started. */
  private historyDraft = ''
  /** Identity of the active match before the last mutation re-sync. */
  private anchor: MatchAnchor | null = null

  /** Whether the bar is currently open (read by the header action button). */
  get isOpen(): boolean {
    return this.state.open
  }

  /**
   * Install the document-level effects: stylesheet, bar DOM, and the
   * Ctrl+F / Escape key capture. Idempotent.
   */
  install(): void {
    if (this.installed) return
    this.installed = true
    adoptStyles()
    this.mountBar()
    window.addEventListener('keydown', this.onKeyDown, true)
  }

  /** Remove every installed effect and clear any paint. Idempotent. */
  uninstall(): void {
    if (!this.installed) return
    this.installed = false
    window.removeEventListener('keydown', this.onKeyDown, true)
    this.close()
    this.bar?.remove()
    this.bar = null
    this.input = null
    this.countEl = null
    this.prevBtn = null
    this.nextBtn = null
    this.caseBtn = null
    this.wordBtn = null
  }

  /** Open the bar (no-op when no conversation is rendered). */
  open(): void {
    if (this.bar === null || this.input === null) return
    if (resolveScope() === null) return
    this.state.open = true
    this.bar.hidden = false
    this.input.focus()
    this.input.select()
    this.syncActionButton()
    this.watchScope()
    // Re-run a stale query against a possibly changed transcript.
    if (this.state.query.trim() !== '') this.runSearch(false)
    else this.renderCount()
  }

  /** Close the bar, drop the cursor, and clear every highlight. */
  close(): void {
    this.state.open = false
    if (this.bar !== null) this.bar.hidden = true
    this.state.index = -1
    clearPaint()
    this.syncActionButton()
    this.unwatchScope()
    clearTimeout(this.searchTimer)
    clearTimeout(this.mutationTimer)
  }

  /**
   * Mirror the open state onto the header action button (plain-DOM side
   * channel — the React button renders once and must not re-render for this).
   */
  private syncActionButton(): void {
    const btn = document.querySelector('.dsh-conv-search-action')
    if (btn === null) return
    btn.setAttribute('aria-pressed', String(this.state.open))
  }

  /** Toggle (the header action button's gesture). */
  toggle(): void {
    if (this.state.open) this.close()
    else this.open()
  }

  /** Advance to the next match (wrap-around). */
  next(): void {
    this.step(1)
  }

  /** Retreat to the previous match (wrap-around). */
  prev(): void {
    this.step(-1)
  }

  // ------------------------------------------------------------------ bar

  /** Build the floating bar once and hide it until opened. */
  private mountBar(): void {
    const bar = document.createElement('div')
    bar.setAttribute('data-dsh-conv-search-bar', '')
    bar.hidden = true
    bar.setAttribute('role', 'search')

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = t('input.placeholder')
    input.setAttribute('aria-label', t('input.placeholder'))
    input.spellcheck = false
    input.addEventListener('input', () => {
      this.state.query = input.value
      this.historyCursor = -1
      this.setNoResult(false)
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => { this.runSearch(true) }, SEARCH_DEBOUNCE_MS)
    })
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) this.prev()
        else this.next()
        this.commitHistory()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Browse previous queries, the browser/IDE find-bar convention.
        e.preventDefault()
        this.browseHistory(e.key === 'ArrowUp' ? 1 : -1)
      }
      // Escape and F3/Ctrl+G are owned by the window capture handler so they
      // behave identically no matter which element holds focus.
      e.stopPropagation()
    })

    const count = document.createElement('span')
    count.setAttribute('data-dsh-conv-search-count', '')
    count.setAttribute('aria-live', 'polite')

    const caseBtn = this.toggleButton(t('toggle.case'), 'Aa', this.state.options.caseSensitive)
    const wordBtn = this.toggleButton(t('toggle.word'), 'ab', this.state.options.wholeWord)
    caseBtn.addEventListener('click', () => { this.toggleOption('caseSensitive') })
    wordBtn.addEventListener('click', () => { this.toggleOption('wholeWord') })

    const prevBtn = this.iconButton(t('button.prev'), 'M9.5 12 15 6.5 13.9 5.4 7.3 12l6.6 6.6L15 17.5z')
    const nextBtn = this.iconButton(t('button.next'), 'M14.5 12 9 17.5l1.1 1.1 6.6-6.6-6.6-6.6L9 6.5z')
    const closeBtn = this.iconButton(t('button.close'), 'M6.4 5.3 12 10.9l5.6-5.6 1.1 1.1L13.1 12l5.6 5.6-1.1 1.1L12 13.1l-5.6 5.6-1.1-1.1L10.9 12 5.3 6.4z')
    prevBtn.addEventListener('click', () => { this.prev(); this.input?.focus() })
    nextBtn.addEventListener('click', () => { this.next(); this.input?.focus() })
    closeBtn.addEventListener('click', () => { this.close() })

    bar.append(input, count, caseBtn, wordBtn, prevBtn, nextBtn, closeBtn)
    document.body.appendChild(bar)
    this.bar = bar
    this.input = input
    this.countEl = count
    this.prevBtn = prevBtn
    this.nextBtn = nextBtn
    this.caseBtn = caseBtn
    this.wordBtn = wordBtn
  }

  /**
   * Build one compact text toggle (Aa = case sensitive, ab = whole word).
   * Plain text glyphs keep the bar dependency-free and legible at 16px.
   * @param label - accessible label / tooltip.
   * @param glyph - the two-letter glyph text.
   * @param pressed - initial pressed state.
   * @returns the toggle button element.
   */
  private toggleButton(label: string, glyph: string, pressed: boolean): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = label
    btn.setAttribute('aria-label', label)
    btn.setAttribute('aria-pressed', String(pressed))
    btn.setAttribute('data-dsh-conv-search-toggle', '')
    btn.textContent = glyph
    return btn
  }

  /**
   * Flip one matching option, reflect it on the toggle button, and re-run
   * the current query immediately (no debounce — an explicit gesture).
   * @param key - which option to flip.
   */
  private toggleOption(key: keyof MatchOptions): void {
    this.state.options = { ...this.state.options, [key]: !this.state.options[key] }
    const btn = key === 'caseSensitive' ? this.caseBtn : this.wordBtn
    if (btn !== null) btn.setAttribute('aria-pressed', String(this.state.options[key]))
    clearTimeout(this.searchTimer)
    this.runSearch(true)
    this.input?.focus()
  }

  // ------------------------------------------------------------- history

  /**
   * Record the current non-empty query into history (most recent first,
   * deduplicated, capped). Called when a query is committed via Enter.
   */
  private commitHistory(): void {
    const query = this.state.query.trim()
    if (query === '') return
    this.history = [query, ...this.history.filter(h => h !== query)].slice(0, HISTORY_LIMIT)
    this.historyCursor = -1
  }

  /**
   * Step through the query history. ArrowUp walks toward older entries,
   * ArrowDown back toward the parked draft. Each step re-runs the search.
   * @param delta - +1 for older, -1 for newer.
   */
  private browseHistory(delta: number): void {
    if (this.input === null || this.history.length === 0) return
    if (this.historyCursor === -1) {
      if (delta < 0) return
      this.historyDraft = this.input.value
      this.historyCursor = 0
    } else {
      const next = this.historyCursor + delta
      if (next < 0) {
        // Back past the newest entry: restore the parked draft.
        this.historyCursor = -1
        this.input.value = this.historyDraft
        this.state.query = this.historyDraft
        clearTimeout(this.searchTimer)
        this.searchTimer = setTimeout(() => { this.runSearch(true) }, SEARCH_DEBOUNCE_MS)
        return
      }
      if (next >= this.history.length) return
      this.historyCursor = next
    }
    const entry = this.history[this.historyCursor]
    if (entry === undefined) return
    this.input.value = entry
    this.state.query = entry
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => { this.runSearch(true) }, SEARCH_DEBOUNCE_MS)
  }

  /**
   * Build one 16px icon button with an inline SVG path (no icon dependency —
   * the bar is plain DOM and must not import the React icon components).
   * @param label - accessible label / tooltip.
   * @param d - the SVG path data.
   * @returns the button element.
   */
  private iconButton(label: string, d: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = label
    btn.setAttribute('aria-label', label)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    svg.setAttribute('fill', 'currentColor')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
    btn.appendChild(svg)
    return btn
  }

  // ------------------------------------------------------------- search

  /**
   * Run one search pass over the rendered transcript and repaint.
   * @param jumpToFirst - also move the cursor to the best initial match
   * (the first one at/below the current reading position, wrapping to the
   * top when none qualifies). Pass false for mutation re-syncs, which must
   * never steal the scroll position.
   */
  private runSearch(jumpToFirst: boolean): void {
    const scope = resolveScope()
    const query = this.state.query.trim()
    if (scope === null || query === '') {
      this.state.result = { matches: [], total: 0 }
      this.state.index = -1
      this.anchor = null
      clearPaint()
      this.renderCount()
      return
    }
    this.watchScope()
    const result = findMatches(scope, query, this.state.options)
    this.state.result = result
    if (result.total === 0) {
      this.state.index = -1
      this.anchor = null
    } else if (jumpToFirst) {
      this.state.index = this.initialIndex(scope, result)
      this.anchor = this.anchorOf(result, this.state.index)
      scrollToMatch(result, this.state.index)
    } else {
      // Mutation re-sync: keep the cursor on the SAME match (by identity),
      // never jumping the reader to a different occurrence.
      this.state.index = this.relocateIndex(result)
      this.anchor = this.anchorOf(result, this.state.index)
    }
    paint(result, this.state.index)
    this.renderCount()
  }

  /**
   * Snapshot the active match's identity (text node + start offset) so a
   * later mutation re-sync can find it again.
   * @param result - the current matches.
   * @param index - the active match index.
   * @returns the anchor, or null when nothing is active.
   */
  private anchorOf(result: SearchResult, index: number): MatchAnchor | null {
    const match = result.matches[index]
    if (match === undefined) return null
    return { container: match.range.startContainer, offset: match.range.startOffset }
  }

  /**
   * Locate the previously active match inside a fresh result set. Prefers the
   * exact same text node + offset (the match survived intact); falls back to
   * the same text node (the match moved within it, e.g. streaming appended);
   * otherwise clamps the index so the reader stays put instead of jumping.
   * @param result - the fresh matches.
   * @returns the index to keep active.
   */
  private relocateIndex(result: SearchResult): number {
    const anchor = this.anchor
    if (anchor !== null) {
      // Exact identity: same node, same start offset.
      for (let i = 0; i < result.total; i += 1) {
        const range = result.matches[i]?.range
        if (range !== undefined && range.startContainer === anchor.container
          && range.startOffset === anchor.offset) return i
      }
      // Same node, shifted offset (text grew/shrunk around it).
      for (let i = 0; i < result.total; i += 1) {
        if (result.matches[i]?.range.startContainer === anchor.container) return i
      }
    }
    // No anchor or it vanished: clamp in place.
    return Math.min(Math.max(this.state.index, 0), result.total - 1)
  }

  /**
   * Pick the initial active match: the first one at/below the scrollport's
   * top edge (the reader's current position), wrapping to the first overall.
   * Runtimes without Range geometry (some test environments) fall back to
   * the first match.
   * @param scope - the conversation scrollport.
   * @param result - the located matches.
   * @returns the match index to activate.
   */
  private initialIndex(scope: HTMLElement, result: SearchResult): number {
    const portTop = scope.getBoundingClientRect().top
    for (let i = 0; i < result.total; i += 1) {
      const match = result.matches[i]
      if (match === undefined) continue
      const rect = typeof match.range.getBoundingClientRect === 'function'
        ? match.range.getBoundingClientRect()
        : null
      if (rect === null) return i
      if (rect.top >= portTop - 8) return i
    }
    return 0
  }

  /**
   * Move the cursor by one step with wrap-around, repaint, and scroll.
   * On a zero-result query the bar re-shakes instead — repeated Enter/F3
   * still answers back.
   * @param delta - +1 for next, -1 for previous.
   */
  private step(delta: number): void {
    const { result } = this.state
    if (result.total === 0) {
      if (this.state.open && this.state.query.trim() !== '') this.setNoResult(true)
      return
    }
    const nextIndex = ((this.state.index + delta) % result.total + result.total) % result.total
    this.state.index = nextIndex
    this.anchor = this.anchorOf(result, nextIndex)
    paint(result, nextIndex)
    scrollToMatch(result, nextIndex)
    this.renderCount()
  }

  /** Update the "n / total" readout, the nav buttons' enablement, and the
   * no-result visual state (red count + bar shake cue). */
  private renderCount(): void {
    if (this.countEl === null) return
    const { total } = this.state.result
    const { index } = this.state
    const empty = this.state.query.trim() === ''
    this.countEl.textContent = total === 0
      ? (empty ? '' : t('count.none'))
      : fmt(t('count.of'), { index: index + 1, total })
    this.setNoResult(!empty && total === 0)
    const disabled = total === 0
    if (this.prevBtn !== null) this.prevBtn.disabled = disabled
    if (this.nextBtn !== null) this.nextBtn.disabled = disabled
  }

  /**
   * Toggle the no-result affordance: a state class the stylesheet turns into
   * a red count and a one-shot bar shake. Re-applying while already set
   * retriggers the shake, which is exactly what a repeated Enter on a
   * zero-result query should communicate.
   * @param on - whether the query currently has zero results.
   */
  private setNoResult(on: boolean): void {
    if (this.bar === null) return
    if (!on) {
      this.bar.removeAttribute('data-no-result')
      return
    }
    this.bar.setAttribute('data-no-result', '')
    this.bar.classList.remove('dsh-conv-search-shake')
    // Force a reflow so re-adding the class restarts the animation.
    void this.bar.offsetWidth
    this.bar.classList.add('dsh-conv-search-shake')
  }

  // ---------------------------------------------------------- watching

  /**
   * Keep a MutationObserver on the current scrollport so streaming output,
   * tool cards, and loadOlder pages re-sync the highlights. Re-attaches when
   * the scope element changes (session switch).
   */
  private watchScope(): void {
    const scope = resolveScope()
    if (scope === null || scope === this.observedScope) return
    this.unwatchScope()
    this.observedScope = scope
    this.observer = new MutationObserver(() => {
      if (!this.state.open || this.state.query.trim() === '') return
      clearTimeout(this.mutationTimer)
      this.mutationTimer = setTimeout(() => { this.runSearch(false) }, MUTATION_DEBOUNCE_MS)
    })
    this.observer.observe(scope, { subtree: true, childList: true, characterData: true })
  }

  /** Detach the mutation observer. */
  private unwatchScope(): void {
    this.observer?.disconnect()
    this.observer = null
    this.observedScope = null
  }

  // ------------------------------------------------------------- keys

  /**
   * Document-level capture-phase key handler. Capture ordering matters: this
   * runs before any target listener, so Escape closes even while the input
   * holds focus (the input's own handler only owns Enter).
   *
   * - Ctrl/Cmd+F: open (only when a conversation is rendered).
   * - Escape: close, always, while open.
   * - F3 / Ctrl/Cmd+G (+Shift for backward): navigate matches while open —
   *   the browser/IDE find-bar convention.
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const isFind = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
      && (e.key === 'f' || e.key === 'F')
    if (isFind) {
      // Only take over when a conversation is actually rendered; otherwise
      // the browser's native find stays available.
      if (resolveScope() === null) return
      e.preventDefault()
      e.stopPropagation()
      this.open()
      return
    }
    if (!this.state.open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.close()
      return
    }
    const isNav = e.key === 'F3'
      || ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'g' || e.key === 'G'))
    if (isNav) {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) this.prev()
      else this.next()
    }
  }
}

/** The page-wide controller instance. */
export const controller = new SearchController()
