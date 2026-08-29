/**
 * What any vector store must satisfy before an index lives in it.
 *
 * Written for authored providers (I7), so the checks target the mistakes a
 * plausible implementation makes while looking correct:
 *
 * - **The round trip**: what goes in comes back — keys, text, metadata — and
 *   nearest-first means nearest first.
 * - **Upsert replaces.** The store contract is keyed replacement; a provider
 *   that appends returns the same key twice and quietly shrinks every result
 *   set (the join dedups nothing).
 * - **The refusal.** `assertComparable` is exported precisely so every provider
 *   refuses identically; a store that accepts a foreign fingerprint answers
 *   from an unrelated vector space with full confidence.
 * - **Scan and remove**, because the positional cascade reads chunks back out
 *   of a generation and sweeps orphans; a store without a faithful scan turns
 *   every re-embed into a full rebuild silently.
 *
 * @module @se373/vector-store/conformance
 */
import type { VectorStore } from './index.ts';
/**
 * Run the suite against a live store.
 *
 * Everything happens in generations the suite creates and drops, so it may run
 * against a store that already holds real data.
 * @param store - the provider to check.
 * @throws Error naming the first violated rule.
 */
export declare function assertVectorStoreConformance(store: VectorStore): Promise<void>;
//# sourceMappingURL=conformance.d.ts.map