/**
 * Runtime invariant companion for `@se373/runtime-graph`.
 *
 * @module @se373/runtime-graph/invariant
 */

import type { Context } from '@se373/cordis'
import type {} from '@se373/cordis-plugin-loader'
import type { InvariantInstaller } from '@se373/invariants'

/**
 * The completeness rule, checked rather than asserted.
 *
 * I5 says the graph is derived from the live runtime. That only holds while the
 * projection reports *every* configured row under a distinct identity — an early
 * `continue` for a shape the projection did not expect, or a filter that quietly
 * drops disabled rows, would leave a graph that looks healthy and is missing
 * components. Identity is compared rather than a count, so a drop paired with a
 * duplicate cannot cancel out.
 *
 * The disabled set is asserted separately because it is the one the design is
 * most emphatic about and the one a well-meaning refactor is most likely to
 * take: you cannot turn on what you cannot see.
 *
 * Edges get the same treatment for the same reason. An unsatisfied injection
 * that is silently dropped rather than marked would leave a node that looks
 * fully wired and is not — the one failure the edge work exists to make visible
 * — so the check is that the edge set and the declared injections are the same
 * set, not that the edges look plausible.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    const configured = [...ctx.loader.entries()]
    const projected = ctx.runtimeGraph.snapshot().nodes
    const seen = new Set(projected.map(node => node.entryId))
    if (seen.size !== projected.length) {
      fail(`projection emitted ${projected.length} nodes under ${seen.size} distinct entry ids`)
    }
    const missing = configured.filter(entry => !seen.has(entry.id)).map(entry => entry.id)
    if (missing.length > 0) {
      fail(`projection dropped ${missing.length} loader entries: ${missing.join(', ')}`)
    }
    for (const node of projected) {
      const declared = [...node.injects].sort()
      const edged = node.edges.map(edge => edge.service).sort()
      if (declared.length !== edged.length || declared.some((name, index) => name !== edged[index])) {
        fail(`${node.entryId} declares [${declared.join(', ')}] but has edges for [${edged.join(', ')}]`)
      }
    }
    const disabled = configured.filter(entry => entry.disabled).map(entry => entry.id)
    const shown = projected.filter(node => !node.enabled).map(node => node.entryId)
    if (disabled.length !== shown.length) {
      fail(`${disabled.length} rows are disabled but ${shown.length} are projected as such`)
    }
  },
  { inject: ['runtimeGraph', 'loader'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/runtime-graph', check)
  })
}
