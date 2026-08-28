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

import type { Context } from '@se373/cordis'
import { owningEntry } from './attribute.ts'
import type { NodeContribution, RuntimeGraphNode } from './types.ts'

declare module '@se373/cordis' {
  interface Events {
    /**
     * Contribute semantics onto one derived node.
     *
     * Listeners see every node in the tree and are expected to recognise their
     * own; {@link contributeNode} is the idiom, and does the matching for you.
     * Only `role`, `tier` and `label` survive — the projection re-applies every
     * derived field afterwards, so a listener **cannot** restate what a node is,
     * only what it means.
     * @param node - the derived node, as the projection built it.
     * @param next - the rest of the chain.
     * @mode waterfall
     */
    'graph/node'(node: RuntimeGraphNode, next: () => RuntimeGraphNode): RuntimeGraphNode
  }
}

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
export function contributeNode(ctx: Context, contribution: NodeContribution): void {
  // Resolved once, at mount: the row that owns this fiber cannot change while
  // the fiber is alive, and a lookup per node per snapshot would be waste.
  const entry = owningEntry(ctx.fiber)
  ctx.on('graph/node', (_node, next) => {
    const derived = next()
    if (entry === undefined || derived.entryId !== entry.id) return derived
    return { ...derived, ...contribution }
  })
}
