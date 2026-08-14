window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-conv-search",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/engine.ts
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
		const HL_ALL = "dsh-conv-search";
		/** Highlight name for the single active (focused) match. */
		const HL_ACTIVE = "dsh-conv-search-active";
		/** Selector of the conversation scrollport the engine operates within. */
		const SCROLL_SELECTOR = "[data-conversation-scroll]";
		/** The default matching behavior: case-insensitive substring. */
		const DEFAULT_MATCH_OPTIONS = {
			caseSensitive: false,
			wholeWord: false
		};
		/**
		* Feature-detect the CSS Custom Highlight API.
		* @returns true when the runtime can paint highlights.
		*/
		function highlightsSupported() {
			return typeof CSS !== "undefined" && typeof CSS.highlights !== "undefined";
		}
		/**
		* Resolve the conversation scrollport from anywhere in the document.
		* @param from - any element or the document itself.
		* @returns the scrollport element, or null when no conversation is rendered.
		*/
		function resolveScope(from = document) {
			return from.querySelector(SCROLL_SELECTOR);
		}
		/**
		* Collect the candidate text nodes inside the scope: everything except the
		* composer seat, the plugin bar, and non-rendered script/style content.
		* @param scope - the conversation scrollport.
		* @returns the live text nodes to scan, in document order.
		*/
		function collectTextNodes(scope) {
			const out = [];
			const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode(node) {
				if ((node.nodeValue ?? "").trim() === "") return NodeFilter.FILTER_REJECT;
				const parent = node.parentElement;
				if (parent === null) return NodeFilter.FILTER_REJECT;
				if (parent.closest(`[data-composer-seat], [data-dsh-conv-search-bar], script, style`) !== null) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			} });
			let current = walker.nextNode();
			while (current !== null) {
				out.push(current);
				current = walker.nextNode();
			}
			return out;
		}
		/**
		* Whether a character counts as a word character for whole-word boundaries:
		* letters (any script, including CJK), digits, and underscore.
		* @param ch - a single character ('' at the text edges).
		* @returns true when the character continues a word.
		*/
		function isWordChar(ch) {
			if (ch === "") return false;
			return /^[\p{L}\p{N}_]$/u.test(ch);
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
		function wholeWordOk(text, idx, end, needle) {
			const before = idx > 0 ? text.charAt(idx - 1) : "";
			const after = end < text.length ? text.charAt(end) : "";
			if (isWordChar(needle.charAt(0)) && isWordChar(before)) return false;
			if (isWordChar(needle.charAt(needle.length - 1)) && isWordChar(after)) return false;
			return true;
		}
		/**
		* Find every occurrence of the query across the scope's text nodes and return
		* them as ranges in document order.
		* @param scope - the conversation scrollport.
		* @param query - the raw query (already trimmed, non-empty).
		* @param options - matching behavior (case sensitivity, whole word).
		* @returns the located matches.
		*/
		function findMatches(scope, query, options = DEFAULT_MATCH_OPTIONS) {
			const needle = options.caseSensitive ? query : query.toLowerCase();
			const matches = [];
			if (needle === "") return {
				matches,
				total: 0
			};
			for (const node of collectTextNodes(scope)) {
				const text = node.data;
				const hay = options.caseSensitive ? text : text.toLowerCase();
				let idx = hay.indexOf(needle);
				while (idx !== -1) {
					const end = idx + needle.length;
					if (!options.wholeWord || wholeWordOk(hay, idx, end, needle)) {
						const range = document.createRange();
						range.setStart(node, idx);
						range.setEnd(node, end);
						matches.push({ range });
					}
					idx = hay.indexOf(needle, end);
				}
			}
			return {
				matches,
				total: matches.length
			};
		}
		/** Access the highlight registry, or undefined when unsupported. */
		function registry() {
			if (!highlightsSupported()) return void 0;
			return CSS.highlights;
		}
		/**
		* Paint the located matches: every match under {@link HL_ALL}, and the active
		* one additionally under {@link HL_ACTIVE}. Replaces any previous paint.
		* @param result - the matches to paint.
		* @param activeIndex - the focused match index, or -1 for none.
		*/
		function paint(result, activeIndex) {
			const reg = registry();
			if (reg === void 0) return;
			const all = new Highlight(...result.matches.map((m) => m.range));
			reg.set(HL_ALL, all);
			const activeRange = result.matches[activeIndex]?.range;
			if (activeRange !== void 0) reg.set(HL_ACTIVE, new Highlight(activeRange));
			else reg.delete(HL_ACTIVE);
		}
		/**
		* Remove every highlight this plugin painted. Idempotent.
		*/
		function clearPaint() {
			const reg = registry();
			if (reg === void 0) return;
			reg.delete(HL_ALL);
			reg.delete(HL_ACTIVE);
		}
		/**
		* Scroll the active match into view. Runtimes without Range geometry (some
		* test environments) degrade to a no-op.
		* @param result - the current matches.
		* @param index - the match index to focus.
		*/
		function scrollToMatch(result, index) {
			const target = result.matches[index];
			if (target === void 0) return;
			if (typeof target.range.getBoundingClientRect !== "function") return;
			const rect = target.range.getBoundingClientRect();
			const scrollport = resolveScope();
			if (scrollport === null) return;
			const portRect = scrollport.getBoundingClientRect();
			const delta = rect.top - portRect.top - scrollport.clientHeight / 2 + rect.height / 2;
			scrollport.scrollBy({
				top: delta,
				behavior: "smooth"
			});
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Global stylesheet adoption: the floating search bar chrome plus the two
		* `::highlight()` paint rules for the Custom Highlight API. Injected once
		* into document.head with a stable id so repeated plugin loads never
		* double-inject.
		*/
		/** Stable id of the injected <style> element. */
		const STYLE_ID = "dsh-conv-search-style";
		/**
		* The full stylesheet. Uses the harness --dsw-alias-* design tokens so the
		* bar follows the active theme, with plain-color fallbacks for tokens a given
		* build may not define. The ::highlight() rules style the overlay paint —
		* only color/background are honored by the engine, so keep them simple.
		*/
		const STYLE_TEXT = `
/* ---- highlight paint (CSS Custom Highlight API) ---- */
::highlight(dsh-conv-search) {
  background-color: rgba(250, 204, 21, .42);
  color: inherit;
}
::highlight(dsh-conv-search-active) {
  background-color: #f59e0b;
  color: #111827;
}

/* ---- floating bar ---- */
[data-dsh-conv-search-bar] {
  position: fixed;
  top: 64px;
  right: 24px;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-line-border, rgba(127, 127, 127, .22));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .18);
  color: var(--dsw-alias-label-primary, #111827);
  max-width: calc(100vw - 48px);
}
/* The hidden attribute ships with a UA display:none that the rule above
 * would override — restate it explicitly so close() really hides the bar. */
[data-dsh-conv-search-bar][hidden] {
  display: none;
}
[data-dsh-conv-search-bar] input {
  appearance: none;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  min-width: 200px;
  max-width: 320px;
  padding: 4px 2px;
}
[data-dsh-conv-search-bar] input::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(127, 127, 127, .7));
}
[data-dsh-conv-search-count] {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, rgba(127, 127, 127, .9));
  min-width: 56px;
  text-align: center;
  white-space: nowrap;
  user-select: none;
}
[data-dsh-conv-search-bar] button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, currentColor);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  padding: 0;
  flex: none;
}
[data-dsh-conv-search-bar] button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  color: var(--dsw-alias-label-secondary, currentColor);
}
[data-dsh-conv-search-bar] button:disabled {
  cursor: default;
  opacity: .38;
}

/* ---- matching option toggles (Aa / ab) ---- */
[data-dsh-conv-search-bar] button[data-dsh-conv-search-toggle] {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -.02em;
  line-height: 1;
  color: var(--dsw-alias-label-tertiary, currentColor);
}
[data-dsh-conv-search-bar] button[data-dsh-conv-search-toggle][aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-primary, currentColor);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-line-border, rgba(127, 127, 127, .3));
}

/* ---- no-result affordance: red count + one-shot shake ---- */
[data-dsh-conv-search-bar][data-no-result] {
  border-color: rgba(220, 38, 38, .55);
}
[data-dsh-conv-search-bar][data-no-result] [data-dsh-conv-search-count] {
  color: #dc2626;
}
[data-dsh-conv-search-bar].dsh-conv-search-shake {
  animation: dsh-conv-search-shake .3s ease-in-out;
}
@keyframes dsh-conv-search-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-conv-search-bar].dsh-conv-search-shake { animation: none; }
}

/* ---- narrow viewports: dock the bar to the top edge, full width ---- */
@media (max-width: 640px) {
  [data-dsh-conv-search-bar] {
    top: 8px;
    left: 8px;
    right: 8px;
    max-width: none;
  }
  [data-dsh-conv-search-bar] input {
    flex: 1;
    min-width: 0;
    max-width: none;
  }
}

/* ---- session header action button ---- */
.dsh-conv-search-action {
  appearance: none;
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  cursor: pointer;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  margin: 0;
  padding: 6px;
  width: 28px;
}
.dsh-conv-search-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12));
  color: var(--dsw-alias-label-secondary, currentColor);
}
.dsh-conv-search-action[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .16));
  color: var(--dsw-alias-label-primary, currentColor);
}
`;
		/**
		* Inject the stylesheet once. Safe to call from multiple mount paths.
		*/
		function adoptStyles() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = STYLE_TEXT;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/i18n.ts
		/**
		* Tiny self-contained i18n for the search bar. The bar renders outside the
		* slot render tree (fixed overlay), so it carries its own dictionaries and
		* picks the language from the document/navigator instead of the locale
		* service — zero extra service dependencies.
		*/
		/** Simplified Chinese dictionary (key-set source of truth). */
		const zh = {
			"action.label": "会话内搜索",
			"action.aria": "在当前会话中搜索文本 (Ctrl+F)",
			"action.hint": "会话内搜索 (Ctrl+F)",
			"input.placeholder": "搜索当前会话…",
			"count.none": "无结果",
			"count.of": "{index} / {total}",
			"button.prev": "上一个 (Shift+Enter)",
			"button.next": "下一个 (Enter)",
			"button.close": "关闭 (Esc)",
			"toggle.case": "区分大小写",
			"toggle.word": "全词匹配"
		};
		/** English dictionary, complete against the zh key set. */
		const en = {
			"action.label": "Search in conversation",
			"action.aria": "Search text in this conversation (Ctrl+F)",
			"action.hint": "Search in conversation (Ctrl+F)",
			"input.placeholder": "Search this conversation…",
			"count.none": "No results",
			"count.of": "{index} / {total}",
			"button.prev": "Previous (Shift+Enter)",
			"button.next": "Next (Enter)",
			"button.close": "Close (Esc)",
			"toggle.case": "Match case",
			"toggle.word": "Whole word"
		};
		/**
		* Detect the UI language once: the document lang attribute wins, then the
		* navigator; anything Chinese-prefixed maps to zh, everything else to en.
		* @returns the active dictionary.
		*/
		function detectDict() {
			return (document.documentElement.lang || navigator.language || "en").toLowerCase().startsWith("zh") ? zh : en;
		}
		let active;
		/**
		* Translate one key.
		* @param key - dictionary key.
		* @returns the localized text.
		*/
		function t(key) {
			active ??= detectDict();
			return active[key];
		}
		/**
		* Fill `{name}`-style placeholders in a dictionary template.
		* @param template - dictionary text.
		* @param params - placeholder values.
		* @returns the filled text.
		*/
		function fmt(template, params) {
			return template.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? `{${name}}`));
		}
		//#endregion
		//#region src/client/controller.ts
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
		/** Debounce for input-driven re-searches (ms). */
		const SEARCH_DEBOUNCE_MS = 120;
		/** Debounce for mutation-driven re-searches (ms). */
		const MUTATION_DEBOUNCE_MS = 160;
		/** Upper bound of the in-memory query history. */
		const HISTORY_LIMIT = 20;
		/**
		* The singleton controller. A page hosts exactly one conversation pane, so a
		* module-level instance is the right ownership; cordis install/uninstall
		* bracket its DOM effects.
		*/
		var SearchController = class {
			state = {
				open: false,
				query: "",
				options: DEFAULT_MATCH_OPTIONS,
				result: {
					matches: [],
					total: 0
				},
				index: -1
			};
			bar = null;
			input = null;
			countEl = null;
			prevBtn = null;
			nextBtn = null;
			caseBtn = null;
			wordBtn = null;
			searchTimer;
			mutationTimer;
			observer = null;
			observedScope = null;
			installed = false;
			/** In-memory query history (most recent first), capped at HISTORY_LIMIT. */
			history = [];
			/** Cursor into history while ArrowUp/ArrowDown is held; -1 = not browsing. */
			historyCursor = -1;
			/** The input value parked before history browsing started. */
			historyDraft = "";
			/** Identity of the active match before the last mutation re-sync. */
			anchor = null;
			/** Whether the bar is currently open (read by the header action button). */
			get isOpen() {
				return this.state.open;
			}
			/**
			* Install the document-level effects: stylesheet, bar DOM, and the
			* Ctrl+F / Escape key capture. Idempotent.
			*/
			install() {
				if (this.installed) return;
				this.installed = true;
				adoptStyles();
				this.mountBar();
				window.addEventListener("keydown", this.onKeyDown, true);
			}
			/** Remove every installed effect and clear any paint. Idempotent. */
			uninstall() {
				if (!this.installed) return;
				this.installed = false;
				window.removeEventListener("keydown", this.onKeyDown, true);
				this.close();
				this.bar?.remove();
				this.bar = null;
				this.input = null;
				this.countEl = null;
				this.prevBtn = null;
				this.nextBtn = null;
				this.caseBtn = null;
				this.wordBtn = null;
			}
			/** Open the bar (no-op when no conversation is rendered). */
			open() {
				if (this.bar === null || this.input === null) return;
				if (resolveScope() === null) return;
				this.state.open = true;
				this.bar.hidden = false;
				this.input.focus();
				this.input.select();
				this.syncActionButton();
				this.watchScope();
				if (this.state.query.trim() !== "") this.runSearch(false);
				else this.renderCount();
			}
			/** Close the bar, drop the cursor, and clear every highlight. */
			close() {
				this.state.open = false;
				if (this.bar !== null) this.bar.hidden = true;
				this.state.index = -1;
				clearPaint();
				this.syncActionButton();
				this.unwatchScope();
				clearTimeout(this.searchTimer);
				clearTimeout(this.mutationTimer);
			}
			/**
			* Mirror the open state onto the header action button (plain-DOM side
			* channel — the React button renders once and must not re-render for this).
			*/
			syncActionButton() {
				const btn = document.querySelector(".dsh-conv-search-action");
				if (btn === null) return;
				btn.setAttribute("aria-pressed", String(this.state.open));
			}
			/** Toggle (the header action button's gesture). */
			toggle() {
				if (this.state.open) this.close();
				else this.open();
			}
			/** Advance to the next match (wrap-around). */
			next() {
				this.step(1);
			}
			/** Retreat to the previous match (wrap-around). */
			prev() {
				this.step(-1);
			}
			/** Build the floating bar once and hide it until opened. */
			mountBar() {
				const bar = document.createElement("div");
				bar.setAttribute("data-dsh-conv-search-bar", "");
				bar.hidden = true;
				bar.setAttribute("role", "search");
				const input = document.createElement("input");
				input.type = "text";
				input.placeholder = t("input.placeholder");
				input.setAttribute("aria-label", t("input.placeholder"));
				input.spellcheck = false;
				input.addEventListener("input", () => {
					this.state.query = input.value;
					this.historyCursor = -1;
					this.setNoResult(false);
					clearTimeout(this.searchTimer);
					this.searchTimer = setTimeout(() => {
						this.runSearch(true);
					}, SEARCH_DEBOUNCE_MS);
				});
				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						if (e.shiftKey) this.prev();
						else this.next();
						this.commitHistory();
					} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
						e.preventDefault();
						this.browseHistory(e.key === "ArrowUp" ? 1 : -1);
					}
					e.stopPropagation();
				});
				const count = document.createElement("span");
				count.setAttribute("data-dsh-conv-search-count", "");
				count.setAttribute("aria-live", "polite");
				const caseBtn = this.toggleButton(t("toggle.case"), "Aa", this.state.options.caseSensitive);
				const wordBtn = this.toggleButton(t("toggle.word"), "ab", this.state.options.wholeWord);
				caseBtn.addEventListener("click", () => {
					this.toggleOption("caseSensitive");
				});
				wordBtn.addEventListener("click", () => {
					this.toggleOption("wholeWord");
				});
				const prevBtn = this.iconButton(t("button.prev"), "M9.5 12 15 6.5 13.9 5.4 7.3 12l6.6 6.6L15 17.5z");
				const nextBtn = this.iconButton(t("button.next"), "M14.5 12 9 17.5l1.1 1.1 6.6-6.6-6.6-6.6L9 6.5z");
				const closeBtn = this.iconButton(t("button.close"), "M6.4 5.3 12 10.9l5.6-5.6 1.1 1.1L13.1 12l5.6 5.6-1.1 1.1L12 13.1l-5.6 5.6-1.1-1.1L10.9 12 5.3 6.4z");
				prevBtn.addEventListener("click", () => {
					this.prev();
					this.input?.focus();
				});
				nextBtn.addEventListener("click", () => {
					this.next();
					this.input?.focus();
				});
				closeBtn.addEventListener("click", () => {
					this.close();
				});
				bar.append(input, count, caseBtn, wordBtn, prevBtn, nextBtn, closeBtn);
				document.body.appendChild(bar);
				this.bar = bar;
				this.input = input;
				this.countEl = count;
				this.prevBtn = prevBtn;
				this.nextBtn = nextBtn;
				this.caseBtn = caseBtn;
				this.wordBtn = wordBtn;
			}
			/**
			* Build one compact text toggle (Aa = case sensitive, ab = whole word).
			* Plain text glyphs keep the bar dependency-free and legible at 16px.
			* @param label - accessible label / tooltip.
			* @param glyph - the two-letter glyph text.
			* @param pressed - initial pressed state.
			* @returns the toggle button element.
			*/
			toggleButton(label, glyph, pressed) {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.title = label;
				btn.setAttribute("aria-label", label);
				btn.setAttribute("aria-pressed", String(pressed));
				btn.setAttribute("data-dsh-conv-search-toggle", "");
				btn.textContent = glyph;
				return btn;
			}
			/**
			* Flip one matching option, reflect it on the toggle button, and re-run
			* the current query immediately (no debounce — an explicit gesture).
			* @param key - which option to flip.
			*/
			toggleOption(key) {
				this.state.options = {
					...this.state.options,
					[key]: !this.state.options[key]
				};
				const btn = key === "caseSensitive" ? this.caseBtn : this.wordBtn;
				if (btn !== null) btn.setAttribute("aria-pressed", String(this.state.options[key]));
				clearTimeout(this.searchTimer);
				this.runSearch(true);
				this.input?.focus();
			}
			/**
			* Record the current non-empty query into history (most recent first,
			* deduplicated, capped). Called when a query is committed via Enter.
			*/
			commitHistory() {
				const query = this.state.query.trim();
				if (query === "") return;
				this.history = [query, ...this.history.filter((h) => h !== query)].slice(0, HISTORY_LIMIT);
				this.historyCursor = -1;
			}
			/**
			* Step through the query history. ArrowUp walks toward older entries,
			* ArrowDown back toward the parked draft. Each step re-runs the search.
			* @param delta - +1 for older, -1 for newer.
			*/
			browseHistory(delta) {
				if (this.input === null || this.history.length === 0) return;
				if (this.historyCursor === -1) {
					if (delta < 0) return;
					this.historyDraft = this.input.value;
					this.historyCursor = 0;
				} else {
					const next = this.historyCursor + delta;
					if (next < 0) {
						this.historyCursor = -1;
						this.input.value = this.historyDraft;
						this.state.query = this.historyDraft;
						clearTimeout(this.searchTimer);
						this.searchTimer = setTimeout(() => {
							this.runSearch(true);
						}, SEARCH_DEBOUNCE_MS);
						return;
					}
					if (next >= this.history.length) return;
					this.historyCursor = next;
				}
				const entry = this.history[this.historyCursor];
				if (entry === void 0) return;
				this.input.value = entry;
				this.state.query = entry;
				clearTimeout(this.searchTimer);
				this.searchTimer = setTimeout(() => {
					this.runSearch(true);
				}, SEARCH_DEBOUNCE_MS);
			}
			/**
			* Build one 16px icon button with an inline SVG path (no icon dependency —
			* the bar is plain DOM and must not import the React icon components).
			* @param label - accessible label / tooltip.
			* @param d - the SVG path data.
			* @returns the button element.
			*/
			iconButton(label, d) {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.title = label;
				btn.setAttribute("aria-label", label);
				const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				svg.setAttribute("viewBox", "0 0 24 24");
				svg.setAttribute("width", "16");
				svg.setAttribute("height", "16");
				svg.setAttribute("fill", "currentColor");
				svg.setAttribute("aria-hidden", "true");
				const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
				path.setAttribute("d", d);
				svg.appendChild(path);
				btn.appendChild(svg);
				return btn;
			}
			/**
			* Run one search pass over the rendered transcript and repaint.
			* @param jumpToFirst - also move the cursor to the best initial match
			* (the first one at/below the current reading position, wrapping to the
			* top when none qualifies). Pass false for mutation re-syncs, which must
			* never steal the scroll position.
			*/
			runSearch(jumpToFirst) {
				const scope = resolveScope();
				const query = this.state.query.trim();
				if (scope === null || query === "") {
					this.state.result = {
						matches: [],
						total: 0
					};
					this.state.index = -1;
					this.anchor = null;
					clearPaint();
					this.renderCount();
					return;
				}
				this.watchScope();
				const result = findMatches(scope, query, this.state.options);
				this.state.result = result;
				if (result.total === 0) {
					this.state.index = -1;
					this.anchor = null;
				} else if (jumpToFirst) {
					this.state.index = this.initialIndex(scope, result);
					this.anchor = this.anchorOf(result, this.state.index);
					scrollToMatch(result, this.state.index);
				} else {
					this.state.index = this.relocateIndex(result);
					this.anchor = this.anchorOf(result, this.state.index);
				}
				paint(result, this.state.index);
				this.renderCount();
			}
			/**
			* Snapshot the active match's identity (text node + start offset) so a
			* later mutation re-sync can find it again.
			* @param result - the current matches.
			* @param index - the active match index.
			* @returns the anchor, or null when nothing is active.
			*/
			anchorOf(result, index) {
				const match = result.matches[index];
				if (match === void 0) return null;
				return {
					container: match.range.startContainer,
					offset: match.range.startOffset
				};
			}
			/**
			* Locate the previously active match inside a fresh result set. Prefers the
			* exact same text node + offset (the match survived intact); falls back to
			* the same text node (the match moved within it, e.g. streaming appended);
			* otherwise clamps the index so the reader stays put instead of jumping.
			* @param result - the fresh matches.
			* @returns the index to keep active.
			*/
			relocateIndex(result) {
				const anchor = this.anchor;
				if (anchor !== null) {
					for (let i = 0; i < result.total; i += 1) {
						const range = result.matches[i]?.range;
						if (range !== void 0 && range.startContainer === anchor.container && range.startOffset === anchor.offset) return i;
					}
					for (let i = 0; i < result.total; i += 1) if (result.matches[i]?.range.startContainer === anchor.container) return i;
				}
				return Math.min(Math.max(this.state.index, 0), result.total - 1);
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
			initialIndex(scope, result) {
				const portTop = scope.getBoundingClientRect().top;
				for (let i = 0; i < result.total; i += 1) {
					const match = result.matches[i];
					if (match === void 0) continue;
					const rect = typeof match.range.getBoundingClientRect === "function" ? match.range.getBoundingClientRect() : null;
					if (rect === null) return i;
					if (rect.top >= portTop - 8) return i;
				}
				return 0;
			}
			/**
			* Move the cursor by one step with wrap-around, repaint, and scroll.
			* On a zero-result query the bar re-shakes instead — repeated Enter/F3
			* still answers back.
			* @param delta - +1 for next, -1 for previous.
			*/
			step(delta) {
				const { result } = this.state;
				if (result.total === 0) {
					if (this.state.open && this.state.query.trim() !== "") this.setNoResult(true);
					return;
				}
				const nextIndex = ((this.state.index + delta) % result.total + result.total) % result.total;
				this.state.index = nextIndex;
				this.anchor = this.anchorOf(result, nextIndex);
				paint(result, nextIndex);
				scrollToMatch(result, nextIndex);
				this.renderCount();
			}
			/** Update the "n / total" readout, the nav buttons' enablement, and the
			* no-result visual state (red count + bar shake cue). */
			renderCount() {
				if (this.countEl === null) return;
				const { total } = this.state.result;
				const { index } = this.state;
				const empty = this.state.query.trim() === "";
				this.countEl.textContent = total === 0 ? empty ? "" : t("count.none") : fmt(t("count.of"), {
					index: index + 1,
					total
				});
				this.setNoResult(!empty && total === 0);
				const disabled = total === 0;
				if (this.prevBtn !== null) this.prevBtn.disabled = disabled;
				if (this.nextBtn !== null) this.nextBtn.disabled = disabled;
			}
			/**
			* Toggle the no-result affordance: a state class the stylesheet turns into
			* a red count and a one-shot bar shake. Re-applying while already set
			* retriggers the shake, which is exactly what a repeated Enter on a
			* zero-result query should communicate.
			* @param on - whether the query currently has zero results.
			*/
			setNoResult(on) {
				if (this.bar === null) return;
				if (!on) {
					this.bar.removeAttribute("data-no-result");
					return;
				}
				this.bar.setAttribute("data-no-result", "");
				this.bar.classList.remove("dsh-conv-search-shake");
				this.bar.offsetWidth;
				this.bar.classList.add("dsh-conv-search-shake");
			}
			/**
			* Keep a MutationObserver on the current scrollport so streaming output,
			* tool cards, and loadOlder pages re-sync the highlights. Re-attaches when
			* the scope element changes (session switch).
			*/
			watchScope() {
				const scope = resolveScope();
				if (scope === null || scope === this.observedScope) return;
				this.unwatchScope();
				this.observedScope = scope;
				this.observer = new MutationObserver(() => {
					if (!this.state.open || this.state.query.trim() === "") return;
					clearTimeout(this.mutationTimer);
					this.mutationTimer = setTimeout(() => {
						this.runSearch(false);
					}, MUTATION_DEBOUNCE_MS);
				});
				this.observer.observe(scope, {
					subtree: true,
					childList: true,
					characterData: true
				});
			}
			/** Detach the mutation observer. */
			unwatchScope() {
				this.observer?.disconnect();
				this.observer = null;
				this.observedScope = null;
			}
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
			onKeyDown = (e) => {
				if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) {
					if (resolveScope() === null) return;
					e.preventDefault();
					e.stopPropagation();
					this.open();
					return;
				}
				if (!this.state.open) return;
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					this.close();
					return;
				}
				if (e.key === "F3" || (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "g" || e.key === "G")) {
					e.preventDefault();
					e.stopPropagation();
					if (e.shiftKey) this.prev();
					else this.next();
				}
			};
		};
		/** The page-wide controller instance. */
		const controller = new SearchController();
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-conv-search browser half: in-conversation text search for the Web UI.
		*
		* Two contributions:
		*  1. A search icon button in the session header's action row, registered
		*     into the harness's `conversation.session.header.actions` slot (the
		*     additive seat for per-session controls beside the title).
		*  2. A document-level controller (plain DOM, no React) that opens a floating
		*     search bar on Ctrl/Cmd+F, highlights every match with the CSS Custom
		*     Highlight API, and walks between them with Enter / Shift+Enter / the
		*     nav buttons — re-syncing automatically while the transcript streams.
		*
		* Zero core changes: everything rides cordis effects and the declared slot.
		*/
		/** Stable Cordis plugin name (matches the manifest id). */
		const name = "@dsh-external/dsh-conv-search";
		/** Required services: the slot registry (the header action seat rides it). */
		const inject = ["slots"];
		/**
		* The session-header search button: toggles the floating bar. Pure
		* presentation over the global controller.
		* @param _props - the slot's standard kit (unused).
		* @returns the icon button.
		*/
		function SearchActionButton(_props) {
			const icon = (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: 16,
				height: 16,
				fill: "none",
				"aria-hidden": true
			}, (0, react.createElement)("circle", {
				cx: 7,
				cy: 7,
				r: 4.5,
				stroke: "currentColor",
				strokeWidth: 1.5
			}), (0, react.createElement)("path", {
				d: "M10.5 10.5 14 14",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round"
			}));
			return (0, react.createElement)("button", {
				type: "button",
				className: "dsh-conv-search-action",
				title: t("action.hint"),
				"aria-label": t("action.aria"),
				"aria-pressed": "false",
				onClick: () => {
					controller.toggle();
				}
			}, icon);
		}
		/**
		* Browser plugin body: install the controller's document effects and
		* register the header action button into the session header slot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			adoptStyles();
			ctx.effect(() => {
				controller.install();
				return () => {
					controller.uninstall();
				};
			}, "dsh-conv-search: controller");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "dsh-conv-search-action",
				order: 100,
				inject: () => ({})
			}, SearchActionButton));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
