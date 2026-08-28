/**
 * Runtime invariant companion for `@se373/board-gateway`.
 *
 * @module @se373/board-gateway/invariant
 */
import type { Context } from '@se373/cordis';
import type { BoardGateway } from './index.ts';
declare module '@se373/cordis' {
    interface Context {
        board: BoardGateway;
    }
}
/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void;
//# sourceMappingURL=invariant.d.ts.map