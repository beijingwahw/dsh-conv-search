/**
 * dsh-conv-search host half: no server-side behavior — the in-conversation
 * search bar, highlighting, and navigation live entirely in the browser
 * bundle (exports["./client"]). The host half exists so the manifest has a
 * node entry and a home for the invariant companion; keep it a registration
 * shell.
 *
 * The parameter is typed structurally (not through a cordis import) so this
 * package typechecks without a monorepo checkout; the Loader passes the real
 * root Context at runtime.
 */

/** Minimal structural face of the cordis root context this shell receives. */
interface HostContext {
  readonly [key: string]: unknown
}

/** Stable Cordis plugin name (matches the manifest id). */
export const name = '@dsh-external/dsh-conv-search'

/**
 * Browser-only behavior; the host half is an empty registration shell.
 * @param _ctx - host root context (unused).
 */
export function apply(_ctx: HostContext): void {}
