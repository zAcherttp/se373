/**
 * What a provider must satisfy to be allowed to write an index.
 *
 * Split deliberately in two, because the two halves cost different amounts:
 *
 * - {@link describeIdentityFault} is structural and free. It runs at every boot
 *   from the seam's invariant companion, against whatever is actually mounted.
 * - {@link assertEmbedderConformance} is behavioural and expensive — it runs the
 *   model. It is called by the demo and by anything about to build a generation,
 *   not at boot, because loading 300 MB of weights to answer "did this row
 *   mount" would make the boot check the slowest thing in the process.
 *
 * This is the shape invariant I7 asks for — authored code mounts only after
 * passing its seam conformance suite — arriving early because the embedding
 * seam is the first one with two plausible providers.
 *
 * @module @se373/embedding/conformance
 */
import { type EmbedderIdentity } from './types.ts';
import type { Embedder } from './index.ts';
/**
 * Why an identity is unusable, or `null` if it is well formed.
 *
 * Every rule here guards a failure that produces vectors rather than an error.
 * The two worth naming: a `revision` that is a branch rather than a commit makes
 * the fingerprint a promise about bytes that can change underneath it; and a
 * `fingerprint` that does not recompute means someone edited an identity field
 * without re-digesting, which is precisely the "declared, not computed"
 * staleness flag the design rejects.
 * @param identity - the identity to check.
 * @returns a human-readable fault, or `null`.
 */
export declare function describeIdentityFault(identity: EmbedderIdentity): string | null;
/**
 * Run the behavioural suite against a live provider.
 *
 * The role check is the one that earns this function's existence. A provider
 * that accepts `role` and ignores it passes every other check here — the shapes
 * are right, the norms are right, the fingerprint matches — and produces an
 * index whose recall is quietly worse than it should be. Nothing else notices.
 * @param embedder - a provider whose readiness is `ready`.
 * @throws Error naming the first violated rule.
 */
export declare function assertEmbedderConformance(embedder: Embedder): Promise<void>;
//# sourceMappingURL=conformance.d.ts.map