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
import { Context } from '@se373/cordis';
import type { NodeTransition } from './types.ts';
/**
 * Records `internal/status` against the loader row that owns the fiber.
 *
 * Only a row's **root** fiber is recorded. Every plugin creates inner fibers as
 * it runs, and their states are an implementation detail of the row; the
 * lifecycle axis on the node reports the root fiber, so the history has to
 * report the same thing or the two would contradict each other.
 */
export declare class TransitionRecorder {
    private readonly ctx;
    private readonly byEntry;
    constructor(ctx: Context);
    /**
     * Subscribe to the runtime's status event.
     *
     * Registered as an effect, so unloading the graph row stops the recording —
     * invariant I6.
     */
    watch(): void;
    /**
     * The history of one row, oldest first.
     * @param entryId - the loader entry id.
     * @returns its transitions; empty when nothing has been observed.
     */
    get(entryId: string): readonly NodeTransition[];
    /**
     * Drop history for rows that no longer exist.
     *
     * A row deleted from the config has no node to hang its history off, so
     * keeping it would be a slow leak across a long editing session.
     * @param liveIds - every entry id currently in the loader tree.
     */
    prune(liveIds: ReadonlySet<string>): void;
    private record;
    /**
     * The log's sequence number right now.
     *
     * Read off the service rather than through `ctx.get('logger')`: the logger is
     * installed as a context property, not into the reflect store, so the store
     * lookup returns nothing and every watermark would silently read `0` — which
     * looks like a working correlation and is not one.
     */
    private watermark;
}
//# sourceMappingURL=transitions.d.ts.map