/**
 * The runtime graph, over the wire.
 *
 * `ctx.runtimeGraph` is a host service; the board is a browser view. This is
 * the one thing between them — a Remote namespace the generated typert
 * descriptor turns into an `/api` endpoint and a typed client method.
 *
 * It exists as its own package for the reason the tool did: the projection is
 * infrastructure, and exposing it over a network boundary is a **deployment
 * choice**. Invariant I3 says a deployment choice is a config row you can
 * disable, not an import you have to delete — and this one is a row a
 * hardened deployment might well turn off.
 *
 * Why the fence matters here specifically: a node carries its **resolved
 * config**. That is the payload's whole point at the board, and it is also the
 * reason this must not become a plain route on the webserver. `/api` is behind
 * the browser-trust fence; an unauthenticated route beside it would publish
 * every row's configuration to anything that could reach the port.
 *
 * @module @se373/board-gateway
 */

import type { Context } from '@se373/cordis'
import type {} from '@se373/runtime-graph'
import { Remote, TypertRemoteService } from '@se373/typert-protocol'
// The generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { BoardSnapshot } from './types.ts'

export type * from './types.ts'

/** Remote-only service exposing the runtime graph to browser surfaces. */
export class BoardGateway extends TypertRemoteService {
  static inject = ['runtimeGraph']

  constructor(ctx: Context) {
    super(ctx, 'board')
  }

  /**
   * Project the whole tree.
   *
   * Unnarrowed on purpose. The narrowing `ctx.runtimeGraph.snapshot()` offers
   * exists so a *model* need not read 190 rows into its context; a board has
   * no such budget problem, and filtering in the browser keeps a filter change
   * from being a round trip.
   * @returns every configured row, disabled ones included.
   */
  @Remote('snapshot')
  snapshot(): BoardSnapshot {
    const snapshot = this.ctx.runtimeGraph.snapshot()
    return {
      capturedAt: snapshot.capturedAt,
      totalNodes: snapshot.totalNodes,
      // Spread rather than pass through: the projection's arrays are readonly
      // and the wire shape is not, because the codec has to construct the far
      // side. The copy is shallow-by-field on purpose -- a structural mismatch
      // should be a type error here, not a silent cast.
      nodes: snapshot.nodes.map(node => ({
        ...node,
        provides: [...node.provides],
        injects: [...node.injects],
        unresolvedInjects: [...node.unresolvedInjects],
        edges: node.edges.map(edge => ({ ...edge })),
        transitions: node.transitions.map(transition => ({ ...transition })),
      })),
    }
  }
}

export default BoardGateway
