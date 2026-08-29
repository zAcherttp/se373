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
import type { Reranker } from './index.ts';
/**
 * Run the suite against a live reranker.
 * @param reranker - the provider to check.
 * @throws Error naming the first violated rule.
 */
export declare function assertRerankerConformance(reranker: Reranker): Promise<void>;
//# sourceMappingURL=conformance.d.ts.map