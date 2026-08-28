/**
 * `graph/node` — the one thing a package may say about itself.
 *
 * The split is deliberate and narrow: the projection derives everything
 * structural, and a package contributes only what no observation could recover
 * — what it *means*. Inference was rejected because it rots. Classifying by
 * package shape needs an edit to the observer for every new shape, and ends up
 * hard-coding specific package names; the block manifest already declares role
 * and tier, and a block should not need a second classification system.
 *
 * The contribution is genuinely optional, and that property is load-bearing on
 * day one: ~190 vendored rows contribute nothing, and the graph still has to be
 * worth reading. A row that says nothing is **untyped, never omitted**.
 *
 * @module @se373/runtime-graph/contribute
 */
import { owningEntry } from "./attribute.js";
/**
 * Declare what this package means, for its own row only.
 *
 * ```ts
 * contributeNode(ctx, { role: 'core', tier: 'L2', label: 'Runtime graph' })
 * ```
 *
 * Registered as an effect, so it is reversible with the row (invariant I6).
 * @param ctx - the contributing plugin's context.
 * @param contribution - what to say about this package's node.
 */
export function contributeNode(ctx, contribution) {
    // Resolved once, at mount: the row that owns this fiber cannot change while
    // the fiber is alive, and a lookup per node per snapshot would be waste.
    const entry = owningEntry(ctx.fiber);
    ctx.on('graph/node', (_node, next) => {
        const derived = next();
        if (entry === undefined || derived.entryId !== entry.id)
            return derived;
        return { ...derived, ...contribution };
    });
}
//# sourceMappingURL=contribute.js.map