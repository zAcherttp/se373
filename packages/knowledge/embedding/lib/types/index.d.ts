/**
 * `ctx.embedder` — the seam that turns text into vectors.
 *
 * A **seam, not a registry.** Cardinality decides the mechanism: exactly one
 * model writes a given index generation, and a second concurrent embedder would
 * not extend the first, it would corrupt it. So providers are pick-one and
 * swapping one is a config-row edit (I3), not an adapter registration.
 *
 * The seam is the `declare module` below plus the abstract {@link Embedder}
 * base — upstream's own shape for this (`@se373/fs` is the same three parts),
 * and it is right for a reason worth stating: `ctx.provide` claims *ownership*
 * of a name, not a namespace, so a row that "declared" the seam would make the
 * first real provider fail with `service "embedder" has been registered`. The
 * name enters the isolate map when a provider registers it, which is also what
 * makes `isolate: { embedder: … }` work without anything declared ahead of it.
 *
 * There is deliberately no `dims` on the seam. Matryoshka models make one set of
 * weights back several widths, so dimensionality belongs to whatever is being
 * written, not to the process.
 *
 * @module @se373/embedding
 */
import { Context, Service } from '@se373/cordis';
import type { EmbedderIdentity, EmbedderReadiness, EmbedResult, EmbedRole } from './types.ts';
export * from './types.ts';
export * from './fingerprint.ts';
export * from './vector.ts';
export * from './template.ts';
export { assertEmbedderConformance, describeIdentityFault } from './conformance.ts';
declare module '@se373/cordis' {
    interface Context {
        embedder: Embedder;
    }
}
/**
 * Abstract embedding provider.
 *
 * Extending this rather than `Service` directly is what keeps the service name
 * in one place, and it makes a provider that forgets a member a compile error
 * instead of a runtime surprise.
 */
export declare abstract class Embedder extends Service {
    constructor(ctx: Context);
    /** What this provider is. Must be readable even while blocked. */
    abstract readonly identity: EmbedderIdentity;
    /**
     * Whether {@link embed} will run or refuse.
     *
     * `blocked` is invariant I2's third tier and is a *mounted* state: the row is
     * on the graph, the identity reads, and only embedding refuses. A provider
     * that threw during construction would leave a hole where the diagnosis
     * should be.
     */
    abstract readonly readiness: EmbedderReadiness;
    /**
     * Embed a batch.
     * @param texts - raw texts; templating is the provider's job, not the caller's.
     * @param role - which side of the model's asymmetry these texts are.
     * @returns vectors in input order, tagged with the producing fingerprint.
     * @throws when {@link readiness} is `blocked`, naming what is missing.
     */
    abstract embed(texts: readonly string[], role: EmbedRole): Promise<EmbedResult>;
}
export default Embedder;
//# sourceMappingURL=index.d.ts.map