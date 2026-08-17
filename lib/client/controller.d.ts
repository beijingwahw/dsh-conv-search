/**
 * The singleton controller. A page hosts exactly one conversation pane, so a
 * module-level instance is the right ownership; cordis install/uninstall
 * bracket its DOM effects.
 */
declare class SearchController {
    private state;
    private bar;
    private input;
    private countEl;
    private prevBtn;
    private nextBtn;
    private caseBtn;
    private wordBtn;
    private searchTimer;
    private mutationTimer;
    private observer;
    private observedScope;
    private installed;
    /** In-memory query history (most recent first), capped at HISTORY_LIMIT. */
    private history;
    /** Cursor into history while ArrowUp/ArrowDown is held; -1 = not browsing. */
    private historyCursor;
    /** The input value parked before history browsing started. */
    private historyDraft;
    /** Identity of the active match before the last mutation re-sync. */
    private anchor;
    /** Whether the bar is currently open (read by the header action button). */
    get isOpen(): boolean;
    /**
     * Install the document-level effects: stylesheet, bar DOM, and the
     * Ctrl+F / Escape key capture. Idempotent.
     */
    install(): void;
    /** Remove every installed effect and clear any paint. Idempotent. */
    uninstall(): void;
    /** Open the bar (no-op when no conversation is rendered). */
    open(): void;
    /** Close the bar, drop the cursor, and clear every highlight. */
    close(): void;
    /**
     * Mirror the open state onto the header action button (plain-DOM side
     * channel — the React button renders once and must not re-render for this).
     */
    private syncActionButton;
    /** Toggle (the header action button's gesture). */
    toggle(): void;
    /** Advance to the next match (wrap-around). */
    next(): void;
    /** Retreat to the previous match (wrap-around). */
    prev(): void;
    /** Build the floating bar once and hide it until opened. */
    private mountBar;
    /**
     * Build one compact text toggle (Aa = case sensitive, ab = whole word).
     * Plain text glyphs keep the bar dependency-free and legible at 16px.
     * @param label - accessible label / tooltip.
     * @param glyph - the two-letter glyph text.
     * @param pressed - initial pressed state.
     * @returns the toggle button element.
     */
    private toggleButton;
    /**
     * Flip one matching option, reflect it on the toggle button, and re-run
     * the current query immediately (no debounce — an explicit gesture).
     * @param key - which option to flip.
     */
    private toggleOption;
    /**
     * Record the current non-empty query into history (most recent first,
     * deduplicated, capped). Called when a query is committed via Enter.
     */
    private commitHistory;
    /**
     * Step through the query history. ArrowUp walks toward older entries,
     * ArrowDown back toward the parked draft. Each step re-runs the search.
     * @param delta - +1 for older, -1 for newer.
     */
    private browseHistory;
    /**
     * Build one 16px icon button with an inline SVG path (no icon dependency —
     * the bar is plain DOM and must not import the React icon components).
     * @param label - accessible label / tooltip.
     * @param d - the SVG path data.
     * @returns the button element.
     */
    private iconButton;
    /**
     * Run one search pass over the rendered transcript and repaint.
     * @param jumpToFirst - also move the cursor to the best initial match
     * (the first one at/below the current reading position, wrapping to the
     * top when none qualifies). Pass false for mutation re-syncs, which must
     * never steal the scroll position.
     */
    private runSearch;
    /**
     * Snapshot the active match's identity (text node + start offset) so a
     * later mutation re-sync can find it again.
     * @param result - the current matches.
     * @param index - the active match index.
     * @returns the anchor, or null when nothing is active.
     */
    private anchorOf;
    /**
     * Locate the previously active match inside a fresh result set. Prefers the
     * exact same text node + offset (the match survived intact); falls back to
     * the same text node (the match moved within it, e.g. streaming appended);
     * otherwise clamps the index so the reader stays put instead of jumping.
     * @param result - the fresh matches.
     * @returns the index to keep active.
     */
    private relocateIndex;
    /**
     * Pick the initial active match: the first one at/below the scrollport's
     * top edge (the reader's current position), wrapping to the first overall.
     * Runtimes without Range geometry (some test environments) fall back to
     * the first match.
     * @param scope - the conversation scrollport.
     * @param result - the located matches.
     * @returns the match index to activate.
     */
    private initialIndex;
    /**
     * Move the cursor by one step with wrap-around, repaint, and scroll.
     * On a zero-result query the bar re-shakes instead — repeated Enter/F3
     * still answers back.
     * @param delta - +1 for next, -1 for previous.
     */
    private step;
    /** Update the "n / total" readout, the nav buttons' enablement, and the
     * no-result visual state (red count + bar shake cue). */
    private renderCount;
    /**
     * Toggle the no-result affordance: a state class the stylesheet turns into
     * a red count and a one-shot bar shake. Re-applying while already set
     * retriggers the shake, which is exactly what a repeated Enter on a
     * zero-result query should communicate.
     * @param on - whether the query currently has zero results.
     */
    private setNoResult;
    /**
     * Keep a MutationObserver on the current scrollport so streaming output,
     * tool cards, and loadOlder pages re-sync the highlights. Re-attaches when
     * the scope element changes (session switch).
     */
    private watchScope;
    /** Detach the mutation observer. */
    private unwatchScope;
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
    private readonly onKeyDown;
}
/** The page-wide controller instance. */
export declare const controller: SearchController;
export {};
