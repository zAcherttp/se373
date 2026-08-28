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
import { BoardOverlay } from "./BoardOverlay.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
export const NS = 'board';
/** Services required by the overlay registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.board'];
/**
 * Contribute the board to the shell overlay.
 * @param ctx - the browser-side Cordis context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-board: dictionaries');
    const snapshot = async () => {
        const result = await ctx.remote.board.snapshot();
        // The error surface stays English: a failure message is for whoever is
        // debugging, and translating it hides the code it carries.
        if (!result.ok)
            throw new Error(`board.snapshot failed: ${result.error.code}: ${result.error.message}`);
        return result.value;
    };
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'runtime-board',
        order: 100,
        locale: NS,
        inject: () => ({ snapshot }),
    }, BoardOverlay));
}
//# sourceMappingURL=index.js.map