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
import z from '@se373/schemastery';
export const name = 'knowledge-dedup';
/** Schema for the config above. */
export const Config = z.object({
    perDocument: z.natural().default(1),
});
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
export function capPerDocument(hits, perDocument) {
    const counts = new Map();
    const kept = [];
    for (const hit of hits) {
        // An empty documentId means the chunk predates the metadata contract, or
        // was written by something that did not follow it. Capping them together
        // would collapse every such hit into one, so they are passed through.
        if (hit.documentId === '') {
            kept.push(hit);
            continue;
        }
        const seen = counts.get(hit.documentId) ?? 0;
        if (seen >= perDocument)
            continue;
        counts.set(hit.documentId, seen + 1);
        kept.push(hit);
    }
    return kept;
}
/**
 * Register the listener.
 * @param ctx - the plugin context.
 * @param config - how many passages per document.
 */
export function apply(ctx, config = {}) {
    const perDocument = config.perDocument ?? 1;
    ctx.on('knowledge/post-retrieve', (_hits, _query, next) => {
        // Delegate first, then filter: a waterfall listener that filters before
        // calling `next()` hides candidates from every listener registered after
        // it, which makes the result depend on row order in a way nobody declared.
        return Promise.resolve(next()).then(inner => capPerDocument(inner, perDocument));
    });
}
export default { name, Config, apply };
//# sourceMappingURL=index.js.map