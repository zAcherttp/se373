/**
 * What any reranker must satisfy: it is a **permutation-and-truncation** of its
 * input, never an author of it.
 *
 * The one liberty a reranker has is order. An authored one that invents a hit
 * fabricates a passage the index does not hold; one that rewrites text corrupts
 * the quote the model will cite; one that returns more than `k` blows the
 * context budget the caller sized. All of those look like working retrieval.
 *
 * @module @se373/rerank/conformance
 */
/** Fixture candidates, nearest first. */
const CANDIDATES = Array.from({ length: 8 }, (_, index) => ({
    key: `doc-${index % 4}#${index}`,
    distance: 0.1 * (index + 1),
    text: `passage ${index}`,
    metadata: { index },
}));
/**
 * Run the suite against a live reranker.
 * @param reranker - the provider to check.
 * @throws Error naming the first violated rule.
 */
export async function assertRerankerConformance(reranker) {
    if (typeof reranker.rerankerRef !== 'string' || reranker.rerankerRef === '') {
        throw new Error('rerankerRef is empty; the index status cannot name this reranker');
    }
    const k = 3;
    const out = await reranker.rerank('which passage answers?', CANDIDATES, k);
    if (out.length > k)
        throw new Error(`asked for ${k} and got ${out.length}; the caller sized a context budget on k`);
    const byKey = new Map(CANDIDATES.map(hit => [hit.key, hit]));
    const seen = new Set();
    for (const hit of out) {
        const source = byKey.get(hit.key);
        if (source === undefined) {
            throw new Error(`hit ${JSON.stringify(hit.key)} is not among the candidates; a reranker permutes, it never invents`);
        }
        if (seen.has(hit.key))
            throw new Error(`hit ${JSON.stringify(hit.key)} returned twice`);
        seen.add(hit.key);
        if (hit.text !== source.text) {
            throw new Error(`hit ${JSON.stringify(hit.key)} came back with different text; the quote the model cites must be the stored one`);
        }
    }
    const empty = await reranker.rerank('anything', [], k);
    if (empty.length !== 0)
        throw new Error('an empty candidate list must rerank to an empty answer');
}
//# sourceMappingURL=conformance.js.map