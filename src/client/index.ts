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
import { createElement, type ReactElement } from 'react'
import { controller } from './controller.ts'
import { adoptStyles } from './styles.ts'
import { t } from './i18n.ts'

/** Stable Cordis plugin name (matches the manifest id). */
export const name = '@dsh-external/dsh-conv-search'

/** Required services: the slot registry (the header action seat rides it). */
export const inject = ['slots']

/**
 * Minimal structural face of the slot service this plugin uses. Declared
 * locally (not imported) so the client bundle stays pure: cross-package
 * value imports are forbidden, and the only runtime dependency is the slot
 * service shape every stock web app provides.
 */
interface SlotsFace {
  inject(key: 'conversation.session.header.actions', callback: () => () => void): () => void
  register(
    options: {
      name: 'conversation.session.header.actions'
      id: string
      order: number
      inject: () => Record<string, never>
    },
    component: (props: HeaderActionProps) => ReactElement | null,
  ): () => void
}

/** Minimal client context face (the slot service is the only dependency). */
interface ClientContextFace {
  slots: SlotsFace
  effect(effect: () => (() => void) | void, label?: string): () => Promise<void>
}

/**
 * The header action button props. The slot renderer spreads the standard
 * session kit (sessionId, useSession, ...) plus the owner share; the button
 * needs none of it, so the type stays open.
 */
interface HeaderActionProps {
  readonly sessionId?: string
}

/**
 * The session-header search button: toggles the floating bar. Pure
 * presentation over the global controller.
 * @param _props - the slot's standard kit (unused).
 * @returns the icon button.
 */
function SearchActionButton(_props: HeaderActionProps): ReactElement {
  // Inline 16px search glyph (no icon-package import keeps the bundle's only
  // runtime dependency on React).
  const icon = createElement(
    'svg',
    { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
    createElement('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.5 }),
    createElement('path', { d: 'M10.5 10.5 14 14', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
  )
  return createElement(
    'button',
    {
      type: 'button',
      className: 'dsh-conv-search-action',
      title: t('action.hint'),
      'aria-label': t('action.aria'),
      'aria-pressed': 'false',
      onClick: () => { controller.toggle() },
    },
    icon,
  )
}

/**
 * Browser plugin body: install the controller's document effects and
 * register the header action button into the session header slot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContextFace): void {
  adoptStyles()

  // Document-level key capture + bar DOM; torn down on plugin unload.
  ctx.effect(() => {
    controller.install()
    return () => { controller.uninstall() }
  }, 'dsh-conv-search: controller')

  // The header action button rides the slot declaration lifetime: present
  // while ui-conversation declares the seat, gone (and re-armed) across
  // runtime swaps.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'dsh-conv-search-action',
    order: 100,
    inject: () => ({}),
  }, SearchActionButton))
}
