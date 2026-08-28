/**
 * Runtime invariant companion for `@se373/tool-graph-inspect`.
 *
 * @module @se373/tool-graph-inspect/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

/**
 * The tool must be visible once the plugin is active. A registration that threw
 * inside a fiber effect is logged and then looks, from the outside, exactly like
 * a tool that was never configured — this is the check that tells them apart.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    if (!ctx.tools.schemas().some(schema => schema.name === 'graph_inspect')) {
      fail('graph_inspect is not registered while its plugin is active')
    }
  },
  { inject: ['tools'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/tool-graph-inspect', check)
  })
}
