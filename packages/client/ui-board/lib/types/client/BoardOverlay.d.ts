import type { BoardSnapshot } from '@se373/board-gateway/types';
import type { InjectFace, PropsLocale, PropsRuntime } from '@se373/client-ui-slots';
/** Registration-side Remote face the board reads through. */
export interface BoardOverlayInjected {
    /** Read a current snapshot of the runtime graph. */
    snapshot: () => Promise<BoardSnapshot>;
}
/** Full component props assembled by the shell-overlay slot renderer. */
export type BoardOverlayProps = PropsRuntime<'shell.overlay'> & PropsLocale<'board'> & InjectFace<BoardOverlayInjected>;
/**
 * The runtime board: every configured row of the tree this UI is served by.
 *
 * Deliberately a panel and not a canvas. The projection's own argument is that
 * the questions worth asking are "what is running", "what failed", and "why is
 * this one stuck" — all three are answered by a list with a detail block, and
 * none of them is answered better by a layout algorithm. The graph drawing is
 * the part to add once there is something it explains that this does not.
 * @param props - the slot's runtime share, the locale seat, and the Remote face.
 * @returns the collapsed pill, or the open panel.
 */
export declare function BoardOverlay({ t, snapshot: read }: BoardOverlayProps): import("react").JSX.Element;
//# sourceMappingURL=BoardOverlay.d.ts.map