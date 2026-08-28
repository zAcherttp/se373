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
import type { ClientContext } from '@se373/client-runtime/client';
import { type BoardLocaleKey } from './locales.ts';
export type { BoardOverlayInjected, BoardOverlayProps } from './BoardOverlay.tsx';
export type { BoardLocaleKey } from './locales.ts';
declare module '@se373/client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Runtime board copy. */
        'board': BoardLocaleKey;
    }
}
/** Dictionary namespace owned by this plugin. */
export declare const NS = "board";
/** Services required by the overlay registration and the generated Remote face. */
export declare const inject: string[];
/**
 * Contribute the board to the shell overlay.
 * @param ctx - the browser-side Cordis context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map