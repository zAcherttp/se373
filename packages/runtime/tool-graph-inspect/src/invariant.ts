/**
 * Runtime invariant companion for `@se373/tool-graph-inspect`.
 *
 * @module @se373/tool-graph-inspect/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

/** The package whose registration this companion vouches for. */
const SUBJECT = '@se373/tool-graph-inspect'

/**
 * The tool must be visible once the plugin is active.
 *
 * A registration that threw inside a fiber effect is logged and then looks, from
 * the outside, exactly like a tool that was never configured — this is the check
 * that tells them apart.
 *
 * **Keyed to the subject's lifecycle, not to `tools` being ready.** The first
 * version of this check asserted as soon as its own injections resolved, which
 * is not the same moment: a loader group applies its entries with
 * `Promise.allSettled`, so the invariant row and the tool row mount
 * concurrently, and "`ctx.tools` is active" does not imply "the tool has
 * registered". It passed for two phases on ordering luck and then failed the
 * first time a sibling subtree did enough async work to change the interleaving
 * — a false alarm, which is worse than no alarm, because it teaches people to
 * ignore the mechanism.
 *
 * So the condition is read the way the docstring always stated it: find the
 * subject on the runtime graph, and assert only once it is genuinely active.
 * Re-evaluated on every lifecycle transition, so the check still runs when the
 * row comes up after this companion — and so it runs again if the row is
 * reloaded.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    const verify = (): void => {
      const active = ctx.runtimeGraph.snapshot().nodes
        .some(node => node.moduleName === SUBJECT && node.lifecycle === 'active')
      if (!active) return
      if (!ctx.tools.schemas().some(schema => schema.name === 'graph_inspect')) {
        fail('graph_inspect is not registered while its plugin is active')
      }
    }
    verify()
    ctx.on('internal/status', () => { verify() })
  },
  { inject: ['tools', 'runtimeGraph'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register(SUBJECT, check)
  })
}
