/**
 * `knowledge/post-retrieve` — at most N passages per document.
 *
 * A listener, not a seam, because §5.1's rule is about cardinality: dedup,
 * diversity and budget truncation all stack, each is optional, and order
 * matters — which is a waterfall, not a pick-one.
 *
 * The problem it solves is specific to chunked retrieval and shows up the
 * moment a real corpus is indexed. A long document is many chunks, its chunks
 * overlap by construction, and a query that matches one of them usually matches
 * its neighbours nearly as well. Nothing is wrong, and yet `k` hits turn out to
 * be one document said five ways, which is the least useful thing a fixed
 * budget can be spent on.
 *
 * Runs on the over-fetched candidate list, ahead of the reranker, so removing a
 * near-duplicate costs an answer slot rather than wasting one.
 *
 * @module @se373/knowledge-dedup
 */
import type { Context } from '@se373/cordis';
import z from '@se373/schemastery';
import type Schema from '@se373/schemastery';
import type { RetrievedChunk } from '@se373/knowledge';
export declare const name = "knowledge-dedup";
/** Configuration for the dedup listener. */
export interface Config {
    /** How many passages one document may contribute. */
    readonly perDocument?: number;
}
/** Schema for the config above. */
export declare const Config: Schema<Config>;
/**
 * Keep at most `perDocument` hits from each document, best first.
 *
 * Order is preserved rather than regrouped: the candidates arrive sorted by
 * distance, so taking the first N per document keeps each document's *best*
 * passage and keeps the overall ranking intact. Sorting by document first would
 * quietly reorder the result set.
 * @param hits - candidates, nearest first.
 * @param perDocument - the cap.
 * @returns the survivors, in the order they arrived.
 */
export declare function capPerDocument(hits: readonly RetrievedChunk[], perDocument: number): RetrievedChunk[];
/**
 * Register the listener.
 * @param ctx - the plugin context.
 * @param config - how many passages per document.
 */
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    Config: z<Config>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map