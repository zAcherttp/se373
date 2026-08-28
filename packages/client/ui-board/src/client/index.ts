/**
 * The runtime board, registered into the shell's frame-wide overlay.
 *
 * `shell.overlay` is upstream's documented seat for "a frame-wide surface of
 * your own" — additive, so nothing of dsh's is displaced, and root-scoped,
 * which matches what the board is about: the process, not a session. It is also
 * the only slot in the layout that is not already occupied, and that is not a
 * coincidence. The other three replace a whole column.
 *
 * @module @se373/client-ui-board/client
 */

import type {} from '@se373/client-locale/client'
import type { ClientContext } from '@se373/client-runtime/client'
// Side-effect type imports: the layout package declares `shell.overlay` into
// SlotMap, and our gateway's generated remote face declares `ctx.remote.board`.
// A declare-merge only reaches a consumer that names the module it lives in.
import type {} from '@se373/client-ui-layout/client'
import type {} from '@se373/board-gateway/remote'
import { BoardOverlay, type BoardOverlayInjected } from './BoardOverlay.tsx'
import { en, zh, type BoardLocaleKey } from './locales.ts'

export type { BoardOverlayInjected, BoardOverlayProps } from './BoardOverlay.tsx'
export type { BoardLocaleKey } from './locales.ts'

declare module '@se373/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Runtime board copy. */
    'board': BoardLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'board'

/** Services required by the overlay registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.board']

/**
 * Contribute the board to the shell overlay.
 * @param ctx - the browser-side Cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-board: dictionaries')

  const snapshot: BoardOverlayInjected['snapshot'] = async () => {
    const result = await ctx.remote.board.snapshot()
    // The error surface stays English: a failure message is for whoever is
    // debugging, and translating it hides the code it carries.
    if (!result.ok) throw new Error(`board.snapshot failed: ${result.error.code}: ${result.error.message}`)
    return result.value
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'runtime-board',
    order: 100,
    locale: NS,
    inject: (): BoardOverlayInjected => ({ snapshot }),
  }, BoardOverlay))
}
