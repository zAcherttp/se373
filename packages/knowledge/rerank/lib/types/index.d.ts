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
import { Context, Service } from '@se373/cordis';
import type { Hit } from '@se373/vector-store';
declare module '@se373/cordis' {
    interface Context {
        reranker: Reranker;
    }
}
/**
 * Abstract reranker.
 */
export declare abstract class Reranker extends Service {
    constructor(ctx: Context);
    /**
     * Digest of this provider and its resolved configuration.
     *
     * Reported in the index status and deliberately **not** an input to the
     * generation key: a read-path change that invalidated the index would make
     * experimenting with ranking cost a rebuild, which is the opposite of what
     * the read/write split is for.
     */
    abstract readonly rerankerRef: string;
    /** One line a human reads in the index status. */
    abstract describe(): string;
    /**
     * Reduce candidates to the final answer.
     *
     * Generic in the hit type so a reranker cannot strip fields a caller added.
     * The pipeline hands it hits decorated with a title and a document id; a
     * signature fixed to `Hit` would silently return them undecorated, and the
     * loss would surface as a missing heading rather than as a type error.
     * @param query - the user's query text, for providers that rescore against it.
     * @param hits - candidates from the store, nearest first.
     * @param k - how many to return.
     * @returns at most `k` of the given hits, best first.
     */
    abstract rerank<T extends Hit>(query: string, hits: readonly T[], k: number): Promise<T[]>;
}
export default Reranker;
//# sourceMappingURL=index.d.ts.map