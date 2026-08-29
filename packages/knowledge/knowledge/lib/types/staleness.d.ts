/**
 * The generation key, and what disagreeing with it costs.
 *
 * §5.5 in code. Two rules, and the second is the one that is easy to get wrong:
 *
 * **The key is computed, never declared.** A block manifest's
 * `indexInvalidating` boolean is a UI hint — "this change rebuilds your index,
 * about four minutes" — and nothing else. The authority is a hash of what the
 * stages actually resolved to. This is load-bearing because §6.5 lets the model
 * author and fork blocks: an authored block can omit or misstate a flag, and a
 * flag-based system would then serve from a poisoned index with no error. A
 * hash cannot be forged by forgetting a field.
 *
 * **Invalidation cascades positionally.** A change at stage N invalidates N to
 * the end and *nothing before it*. Embedding dominates the cost and chunking
 * does not, so an embedder swap that re-crawled and re-chunked a corpus that
 * had not moved would pay for the two cheap stages twice for no reason. Full
 * rebuild is not a separate feature; it is the degenerate case where stage 0
 * changed.
 *
 * @module @se373/knowledge/staleness
 */
import type { RebuildPlan, StageRefs, WritePathStage } from './types.ts';
/**
 * The key an index built by these stages is stored under.
 * @param refs - a digest per write-path stage.
 * @returns lowercase hex SHA-256.
 */
export declare function generationKey(refs: StageRefs): string;
/**
 * The earliest stage at which two configurations differ.
 * @param stored - the refs the index was written with.
 * @param live - the refs currently configured.
 * @returns the first differing stage in cascade order, or `null` if identical.
 */
export declare function firstDivergence(stored: StageRefs, live: StageRefs): WritePathStage | null;
/**
 * What a change at a stage forces, per §5.5's table.
 *
 * Derived from the stage's position rather than written out per stage: the
 * table *is* "everything from here on", and spelling it out row by row invites
 * the two from drifting apart.
 * @param from - the earliest changed stage.
 * @returns the rebuild plan.
 */
export declare function rebuildPlan(from: WritePathStage): RebuildPlan;
/**
 * A human-readable summary of a rebuild, for the approval card.
 * @param plan - the rebuild plan.
 * @returns one sentence.
 */
export declare function describePlan(plan: RebuildPlan): string;
//# sourceMappingURL=staleness.d.ts.map