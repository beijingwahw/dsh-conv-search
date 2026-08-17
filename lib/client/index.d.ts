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
import { type ReactElement } from 'react';
/** Stable Cordis plugin name (matches the manifest id). */
export declare const name = "@dsh-external/dsh-conv-search";
/** Required services: the slot registry (the header action seat rides it). */
export declare const inject: string[];
/**
 * Minimal structural face of the slot service this plugin uses. Declared
 * locally (not imported) so the client bundle stays pure: cross-package
 * value imports are forbidden, and the only runtime dependency is the slot
 * service shape every stock web app provides.
 */
interface SlotsFace {
    inject(key: 'conversation.session.header.actions', callback: () => () => void): () => void;
    register(options: {
        name: 'conversation.session.header.actions';
        id: string;
        order: number;
        inject: () => Record<string, never>;
    }, component: (props: HeaderActionProps) => ReactElement | null): () => void;
}
/** Minimal client context face (the slot service is the only dependency). */
interface ClientContextFace {
    slots: SlotsFace;
    effect(effect: () => (() => void) | void, label?: string): () => Promise<void>;
}
/**
 * The header action button props. The slot renderer spreads the standard
 * session kit (sessionId, useSession, ...) plus the owner share; the button
 * needs none of it, so the type stays open.
 */
interface HeaderActionProps {
    readonly sessionId?: string;
}
/**
 * Browser plugin body: install the controller's document effects and
 * register the header action button into the session header slot.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContextFace): void;
export {};
