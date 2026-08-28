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
 * The snapshot is point-in-time. No subscription, no polling loop: a live
 * transport is a separate decision (D9), taken when the board needs it. Node
 * *history* is not point-in-time, and deliberately so — see `transitions.ts`.
 *
 * @module @se373/runtime-graph
 */
import { Context, Service } from '@se373/cordis';
import type { RuntimeGraphQuery, RuntimeGraphSnapshot } from './types.ts';
export * from './types.ts';
export { contributeNode } from './contribute.ts';
declare module '@se373/cordis' {
    interface Context {
        runtimeGraph: RuntimeGraphService;
    }
}
/**
 * Read-only projection of the live loader and fiber trees.
 *
 * Every call reads the loader directly. Cordis already maintains `Entry.fiber`
 * and `Fiber.state` through its internal plugin/status events, so a cache here
 * would only add a second lifecycle truth to keep synchronized.
 */
export declare class RuntimeGraphService extends Service {
    static inject: string[];
    private readonly transitions;
    constructor(ctx: Context);
    /**
     * Project the loader tree, optionally narrowed.
     *
     * Narrowing happens after projection, not during it, so `totalNodes` always
     * reports the real size of the tree — a narrowed report that cannot say what
     * it left out reads as a complete one.
     * @param query - optional narrowing; an omitted field filters nothing.
     * @returns the snapshot.
     */
    snapshot(query?: RuntimeGraphQuery): RuntimeGraphSnapshot;
}
export default RuntimeGraphService;
//# sourceMappingURL=index.d.ts.map