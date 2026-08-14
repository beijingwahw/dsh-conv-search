/**
 * Global stylesheet adoption: the floating search bar chrome plus the two
 * `::highlight()` paint rules for the Custom Highlight API. Injected once
 * into document.head with a stable id so repeated plugin loads never
 * double-inject.
 */

/** Stable id of the injected <style> element. */
const STYLE_ID = 'dsh-conv-search-style'

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
`

/**
 * Inject the stylesheet once. Safe to call from multiple mount paths.
 */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}
