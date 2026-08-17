# dsh-conv-search（对话内文本搜索）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-blue)](https://github.com/topics/dsh-plugin)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek-Harness-orange)](https://github.com/deepseek-ai/deepseek-harness)

English | [中文](README.zh.md)

In-conversation text search for the DeepSeek Harness web UI — the `Ctrl+F` you already know, scoped to the current chat session. A floating search bar highlights every match in the rendered transcript and walks between them, without touching a single line of harness core code.

## Problems it solves

- **Long sessions are unsearchable**: the browser's native find searches the whole page (sidebar, composer, chrome) and cannot follow a conversation that keeps streaming. This plugin searches only the active conversation scrollport and stays in sync while the model is still writing.
- **No way to jump between occurrences**: native find gives no "n / total" navigation. This plugin provides Enter / Shift+Enter and prev/next buttons with wrap-around, centering each match in view.
- **Highlighting must not fight React**: the transcript DOM is React-owned and re-renders continuously during streaming. Instead of wrapping matches in `<mark>` nodes (which would mutate React-managed text and break reconciliation), the plugin paints ranges through the CSS Custom Highlight API — an overlay that survives every re-render and needs zero DOM cleanup.

## Features

- **Ctrl/Cmd+F** opens the floating search bar (only when a conversation is rendered — otherwise the browser's native find stays untouched); **Esc** closes it from anywhere, including while the input holds focus.
- Matching across every rendered chat node: user messages, assistant text, tool cards, and paged-in history. Two toggles mirror the browser/IDE find bar: **Aa** (match case) and **ab** (whole word) — essential for hunting error codes, function names, and API identifiers.
- Live `n / total` counter with **Enter** (next) / **Shift+Enter** (previous) navigation and wrap-around; **F3** / **Ctrl+G** work too, the browser/IDE find-bar convention.
- **Query history**: **ArrowUp** / **ArrowDown** cycle through your recent queries (most recent first, deduplicated), restoring the draft you were typing when you walk back past the newest entry.
- Zero-result queries answer back: the count turns red, the bar border follows, and the bar gives a one-shot shake (honoring `prefers-reduced-motion`). Repeated Enter on no results re-shakes instead of staying silent.
- The active match is painted in a stronger color and scrolled into view automatically.
- The header action button mirrors the open state (`aria-pressed`), so you always know whether search is active.
- **Streaming-aware**: a MutationObserver re-runs the search (debounced) while output streams or older pages load, without stealing your scroll position. The active match is anchored by identity (text node + offset), so a paged-in older page or a streamed delta never jumps your cursor to a different occurrence.
- Scope discipline: the composer seat and the plugin's own bar are excluded, so your draft text never produces phantom hits.
- Follows the harness theme through `--dsw-alias-*` design tokens; Chinese/English UI picked from the document language.
- Session header action button (search icon) registered through the `conversation.session.header.actions` slot — the additive, unload-safe composition route.

## Install

Requires Node.js ≥ 22 and pnpm (`npm install -g pnpm`) — `dsh plugin add` installs the bundle into the profile with pnpm.

### One-liner

```sh
dsh plugin add beijingwahw/dsh-conv-search --profile web
dsh web   # restart the server to pick the plugin up
```

> Common follow-ups: upgrade `dsh plugin upgrade dsh-conv-search --profile web`; uninstall `dsh plugin remove dsh-conv-search --profile web`; local-path install `dsh plugin add ./dsh-conv-search --profile web`.

The package declares `dsh.bundle.patch` (mounts the host registration row) and `dsh.client` (serves the browser half at `/plugins/<id>/client.js`). `lib/` is committed, so the GitHub tarball installs without a build step.

Verify the mount:

```sh
dsh --profile web --dump-config | grep conv-search
```

## Usage

| Gesture | Action |
|---|---|
| `Ctrl/Cmd+F` (or the header search icon) | Open the search bar |
| Type | Search as you type (120 ms debounce) |
| `Enter` / `F3` / `Ctrl/Cmd+G` | Next match (wraps) |
| `Shift+Enter` / `Shift+F3` / `Ctrl/Cmd+Shift+G` | Previous match (wraps) |
| `ArrowUp` / `ArrowDown` | Browse previous queries |
| `Aa` / `ab` buttons | Match case / whole word |
| `Esc` | Close and clear all highlights |

## How it works

- `src/client/engine.ts` — pure DOM helpers: text-node walk, case-insensitive range matching, `CSS.highlights` paint (`dsh-conv-search` for all matches, `dsh-conv-search-active` for the focused one), and scroll-into-view. No cordis, no React — unit-testable against jsdom.
- `src/client/controller.ts` — the floating bar (plain DOM, so it never couples to the shell's React version), keyboard capture, debounced search passes, and the transcript MutationObserver that keeps highlights honest during streaming.
- `src/client/index.ts` — the cordis client half: installs the controller through `ctx.effect` and registers the header action button via `ctx.slots.inject('conversation.session.header.actions', ...)`, so the button appears and disappears with the slot declaration and plugin fiber.
- `src/index.ts` — the host half is an empty registration shell; all behavior is browser-side.

## Model Experience

None. The plugin only reads the rendered transcript in the browser; it touches no prompt, message, schema, stream, tool, or provider request.

## Development

```sh
pnpm install
pnpm run typecheck   # strict TS, no emit
pnpm run build       # tsdown: host ESM + browser client bundle, then tsc for declarations
pnpm test            # vitest (jsdom): engine, controller, i18n
```

The client bundle enforces the harness purity rule: platform modules (react, cordis, the seeded client packages) stay externals, and any other `@deepseek-ai/*` value import fails the build.

## Known Limitations and Deferred Work

- Matching is plain-text only — no regex, no diacritic folding, no cross-node phrase matching (a phrase split across styled spans will not match).
- Requires a browser with the CSS Custom Highlight API (Chrome/Edge 105+, Safari 17.2+, Firefox 132+). On unsupported browsers the bar still counts matches but paints no highlight.
- The bar position is fixed (`top: 64px; right: 24px`); it is not draggable yet.
- Search scope is the active conversation column only — sidebar session titles and settings pages are intentionally out of scope.

## Troubleshooting

- `'pnpm' is not recognized` during `dsh plugin add` → install pnpm first: `npm install -g pnpm`.
- `EADDRINUSE ... :3080` on `dsh web` → a previous `dsh web` is still bound to the port. Stop it (Ctrl+C in its terminal; on Windows: `Get-NetTCPConnection -LocalPort 3080 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`), or start on another port with `dsh web --port 3081`.

## License

MIT
