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
import { Service } from '@se373/cordis';
export * from "./types.js";
export * from "./fingerprint.js";
export * from "./vector.js";
export * from "./template.js";
export { assertEmbedderConformance, describeIdentityFault } from "./conformance.js";
/**
 * Abstract embedding provider.
 *
 * Extending this rather than `Service` directly is what keeps the service name
 * in one place, and it makes a provider that forgets a member a compile error
 * instead of a runtime surprise.
 */
export class Embedder extends Service {
    constructor(ctx) {
        super(ctx, 'embedder');
    }
}
export default Embedder;
//# sourceMappingURL=index.js.map