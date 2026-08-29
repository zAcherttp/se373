/**
 * `ctx.reranker` — reduce a candidate list to the answer.
 *
 * A **seam**, and the only stage of the plane that is **not** index-invalidating:
 * it is on the read path, so swapping it changes what a query returns without
 * touching a stored vector (§5.5).
 *
 * The stage exists because vector search alone is a poor final ranker. The
 * pipeline over-fetches — asking the store for several times `k` — so that
 * dedup and diversity have material to work with, and something has to reduce
 * that back to `k`. That reduction is this seam. The identity provider,
 * `rerank-none`, keeps the store's own order; a cross-encoder would rescore
 * first. Both answer the same question, which is what makes it a seam rather
 * than an optional decoration.
 *
 * Optional to mount. A pipeline with no reranker truncates to `k` itself, so an
 * unmounted seam degrades to `rerank-none`'s behaviour rather than to a crash —
 * invariant I2's defaulted tier.
 *
 * @module @se373/rerank
 */
import { Service } from '@se373/cordis';
/**
 * Abstract reranker.
 */
export class Reranker extends Service {
    constructor(ctx) {
        super(ctx, 'reranker');
    }
}
export default Reranker;
//# sourceMappingURL=index.js.map