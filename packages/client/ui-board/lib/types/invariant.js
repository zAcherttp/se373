/**
 * Runtime invariant companion for `@se373/client-ui-board`.
 *
 * @module @se373/client-ui-board/invariant
 */
/**
 * No host-side invariant.
 *
 * What could go wrong here goes wrong in the browser — a missing bundle, an
 * unmounted Remote — and neither is observable from the host context. The
 * registration still happens so the package owns its name in the registry and
 * a later check has somewhere to go.
 */
const check = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx) {
    ctx.inject(['invariants'], (ctx) => {
        ctx.invariants.register('@se373/client-ui-board', check);
    });
}
//# sourceMappingURL=invariant.js.map