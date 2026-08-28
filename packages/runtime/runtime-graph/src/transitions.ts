/**
 * Lifecycle history, observed rather than sampled.
 *
 * A node that never dead-ends is the point: click it and you see how it came
 * up, even long after the log lines from that moment have aged out of the ring.
 * The list is bounded by definition — a handful of entries per row, taken
 * straight from the runtime's own status event — so it costs nothing to keep.
 *
 * @module @se373/runtime-graph/transitions
 */

import { Context } from '@se373/cordis'
import type { Fiber } from '@se373/cordis'
// Type-only: contributes `Fiber.entry`.
import type {} from '@se373/cordis-plugin-loader'
import { phaseOf } from './lifecycle.ts'
import type { NodeTransition } from './types.ts'

/**
 * How many transitions one row keeps.
 *
 * A row that comes up cleanly produces two or three. The cap is not there for
 * the ordinary case; it is there because hot reload re-runs the sequence on
 * every save, and an editor left running for an afternoon would otherwise grow
 * this without bound.
 */
const MAX_PER_ENTRY = 32

/**
 * Records `internal/status` against the loader row that owns the fiber.
 *
 * Only a row's **root** fiber is recorded. Every plugin creates inner fibers as
 * it runs, and their states are an implementation detail of the row; the
 * lifecycle axis on the node reports the root fiber, so the history has to
 * report the same thing or the two would contradict each other.
 */
export class TransitionRecorder {
  private readonly byEntry = new Map<string, NodeTransition[]>()

  constructor(private readonly ctx: Context) {}

  /**
   * Subscribe to the runtime's status event.
   *
   * Registered as an effect, so unloading the graph row stops the recording —
   * invariant I6.
   */
  watch(): void {
    this.ctx.on('internal/status', (fiber: Fiber, oldState: number) => {
      this.record(fiber, oldState)
    })
  }

  /**
   * The history of one row, oldest first.
   * @param entryId - the loader entry id.
   * @returns its transitions; empty when nothing has been observed.
   */
  get(entryId: string): readonly NodeTransition[] {
    return this.byEntry.get(entryId) ?? []
  }

  /**
   * Drop history for rows that no longer exist.
   *
   * A row deleted from the config has no node to hang its history off, so
   * keeping it would be a slow leak across a long editing session.
   * @param liveIds - every entry id currently in the loader tree.
   */
  prune(liveIds: ReadonlySet<string>): void {
    for (const entryId of this.byEntry.keys()) {
      if (!liveIds.has(entryId)) this.byEntry.delete(entryId)
    }
  }

  private record(fiber: Fiber, oldState: number): void {
    const entry = fiber.entry
    if (entry === undefined) return
    const list = this.byEntry.get(entry.id) ?? []
    list.push({
      from: phaseOf(oldState),
      to: phaseOf(fiber.state),
      at: Date.now(),
      sn: this.watermark(),
    })
    // Oldest first, oldest dropped: the tail is what a reader wants, and the
    // head of a churning row is a state it already passed through many times.
    if (list.length > MAX_PER_ENTRY) list.splice(0, list.length - MAX_PER_ENTRY)
    this.byEntry.set(entry.id, list)
  }

  /**
   * The log's sequence number right now.
   *
   * Read off the service rather than through `ctx.get('logger')`: the logger is
   * installed as a context property, not into the reflect store, so the store
   * lookup returns nothing and every watermark would silently read `0` — which
   * looks like a working correlation and is not one.
   */
  private watermark(): number {
    return this.ctx.logger._snMessage
  }
}
