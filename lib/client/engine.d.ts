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
export declare const HL_ALL = "dsh-conv-search";
/** Highlight name for the single active (focused) match. */
export declare const HL_ACTIVE = "dsh-conv-search-active";
/** Selector of the conversation scrollport the engine operates within. */
export declare const SCROLL_SELECTOR = "[data-conversation-scroll]";
/** Selector of the composer seat excluded from matching. */
export declare const COMPOSER_SELECTOR = "[data-composer-seat]";
/** Selector of this plugin's floating bar, excluded from matching. */
export declare const BAR_SELECTOR = "[data-dsh-conv-search-bar]";
/** A located match: its range plus enough identity to scroll to it. */
export interface MatchRange {
    /** The highlighted text range (start container is a text node). */
    readonly range: Range;
}
/** Matching behavior toggles, mirroring the browser/IDE find bar. */
export interface MatchOptions {
    /** Match letter case exactly (off = case-insensitive, the default). */
    readonly caseSensitive: boolean;
    /** Only match occurrences bounded by non-word characters. */
    readonly wholeWord: boolean;
}
/** The default matching behavior: case-insensitive substring. */
export declare const DEFAULT_MATCH_OPTIONS: MatchOptions;
/** The result of one search pass over the rendered transcript. */
export interface SearchResult {
    /** Every match in document order. */
    readonly matches: readonly MatchRange[];
    /** Total match count (matches.length). */
    readonly total: number;
}
/**
 * Feature-detect the CSS Custom Highlight API.
 * @returns true when the runtime can paint highlights.
 */
export declare function highlightsSupported(): boolean;
/**
 * Resolve the conversation scrollport from anywhere in the document.
 * @param from - any element or the document itself.
 * @returns the scrollport element, or null when no conversation is rendered.
 */
export declare function resolveScope(from?: ParentNode): HTMLElement | null;
/**
 * Find every occurrence of the query across the scope's text nodes and return
 * them as ranges in document order.
 * @param scope - the conversation scrollport.
 * @param query - the raw query (already trimmed, non-empty).
 * @param options - matching behavior (case sensitivity, whole word).
 * @returns the located matches.
 */
export declare function findMatches(scope: HTMLElement, query: string, options?: MatchOptions): SearchResult;
/**
 * Paint the located matches: every match under {@link HL_ALL}, and the active
 * one additionally under {@link HL_ACTIVE}. Replaces any previous paint.
 * @param result - the matches to paint.
 * @param activeIndex - the focused match index, or -1 for none.
 */
export declare function paint(result: SearchResult, activeIndex: number): void;
/**
 * Remove every highlight this plugin painted. Idempotent.
 */
export declare function clearPaint(): void;
/**
 * Scroll the active match into view. Runtimes without Range geometry (some
 * test environments) degrade to a no-op.
 * @param result - the current matches.
 * @param index - the match index to focus.
 */
export declare function scrollToMatch(result: SearchResult, index: number): void;
