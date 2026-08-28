/**
 * `ctx.runtimeGraph` — the one way to read what is running inside this process.
 *
 * A **core service, not a seam.** Cardinality decides the mechanism: there is
 * one runtime, one loader tree, one fiber tree, so no second provider could
 * exist and nothing here is swappable. That is also what makes invariant I5 true
 * by construction — if the projection is the only way to read the tree, the
 * graph cannot drift from the runtime, because there is no second source for it
 * to drift from.
 *
 * The snapshot is point-in-time. No subscription, no polling loop, no history:
 * a live transport is a separate decision (D9), taken when the board needs it.
 *
 * @module @se373/runtime-graph
 */

import { Context, Service } from '@se373/cordis'
import type {} from '@se373/cordis-plugin-loader'
import { projectTree } from './project.ts'
import type {
  RuntimeGraphNode,
  RuntimeGraphQuery,
  RuntimeGraphSnapshot,
} from './types.ts'

export * from './types.ts'

declare module '@se373/cordis' {
  interface Context {
    runtimeGraph: RuntimeGraphService
  }
}

/**
 * Keep an entry and everything beneath it.
 *
 * Descent is computed from the projected `parentEntryId` chain rather than from
 * id string prefixes: group children keep flat ids, so a prefix test would find
 * an included subtree and miss a group.
 * @param nodes - every projected node.
 * @param rootId - the entry to descend from.
 * @returns the subtree, in loader order.
 */
function descendants(nodes: readonly RuntimeGraphNode[], rootId: string): RuntimeGraphNode[] {
  const kept = new Set<string>([rootId])
  // One forward pass suffices: `ctx.loader.entries()` yields a parent before
  // its children, so an ancestor is always already decided.
  const out: RuntimeGraphNode[] = []
  for (const node of nodes) {
    if (node.entryId !== rootId && (node.parentEntryId === null || !kept.has(node.parentEntryId))) continue
    kept.add(node.entryId)
    out.push(node)
  }
  return out
}

/**
 * Read-only projection of the live loader and fiber trees.
 *
 * Every call reads the loader directly. Cordis already maintains `Entry.fiber`
 * and `Fiber.state` through its internal plugin/status events, so a cache here
 * would only add a second lifecycle truth to keep synchronized.
 */
export class RuntimeGraphService extends Service {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'runtimeGraph')
  }

  /**
   * Project the loader tree, optionally narrowed.
   *
   * Narrowing happens after projection, not during it, so `totalNodes` always
   * reports the real size of the tree — a narrowed report that cannot say what
   * it left out reads as a complete one.
   * @param query - optional narrowing; an omitted field filters nothing.
   * @returns the snapshot.
   */
  snapshot(query: RuntimeGraphQuery = {}): RuntimeGraphSnapshot {
    const all = projectTree(this.ctx)
    let nodes: readonly RuntimeGraphNode[] = all
    if (query.entryId !== undefined) {
      nodes = descendants(nodes, query.entryId)
    }
    if (query.lifecycle !== undefined) {
      const wanted = new Set(query.lifecycle)
      nodes = nodes.filter(node => wanted.has(node.lifecycle))
    }
    if (query.enabled !== undefined) {
      nodes = nodes.filter(node => node.enabled === query.enabled)
    }
    return { capturedAt: Date.now(), nodes, totalNodes: all.length }
  }
}

export default RuntimeGraphService
