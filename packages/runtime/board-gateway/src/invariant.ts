/**
 * Runtime invariant companion for `@se373/board-gateway`.
 *
 * @module @se373/board-gateway/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'
import type { BoardGateway } from './index.ts'
import type { BoardNode } from './types.ts'

declare module '@se373/cordis' {
  interface Context {
    board: BoardGateway
  }
}

/**
 * The gateway must project the same tree the service does.
 *
 * A Remote is a copy of a shape across a boundary, and the failure this catches
 * is the one a boundary invites: the wire cast drifting from the projection, so
 * a browser renders a graph that no longer matches the runtime. I5 is about
 * derivation, and derivation that stops at the network is not derivation.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    const direct = ctx.runtimeGraph.snapshot()
    const wire = ctx.board.snapshot()
    if (wire.totalNodes !== direct.totalNodes) {
      fail(`gateway reports ${wire.totalNodes} rows, the projection has ${direct.totalNodes}`)
    }
    const wireIds = wire.nodes.map((node: BoardNode) => node.entryId).sort().join(',')
    const directIds = direct.nodes.map(node => node.entryId).sort().join(',')
    if (wireIds !== directIds) fail('gateway and projection disagree on which rows exist')
  },
  { inject: ['board', 'runtimeGraph'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/board-gateway', check)
  })
}
