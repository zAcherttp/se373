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
import { Service } from '@se373/cordis';
import { contributeNode } from "./contribute.js";
import { projectTree } from "./project.js";
import { TransitionRecorder } from "./transitions.js";
export * from "./types.js";
export { contributeNode } from "./contribute.js";
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
function descendants(nodes, rootId) {
    const kept = new Set([rootId]);
    // One forward pass suffices: `ctx.loader.entries()` yields a parent before
    // its children, so an ancestor is always already decided.
    const out = [];
    for (const node of nodes) {
        if (node.entryId !== rootId && (node.parentEntryId === null || !kept.has(node.parentEntryId)))
            continue;
        kept.add(node.entryId);
        out.push(node);
    }
    return out;
}
/**
 * Read-only projection of the live loader and fiber trees.
 *
 * Every call reads the loader directly. Cordis already maintains `Entry.fiber`
 * and `Fiber.state` through its internal plugin/status events, so a cache here
 * would only add a second lifecycle truth to keep synchronized.
 */
export class RuntimeGraphService extends Service {
    static inject = ['loader'];
    transitions;
    constructor(ctx) {
        super(ctx, 'runtimeGraph');
        // Subscribed in the constructor rather than from `Service.init`, because
        // every transition that happens before the listener exists is lost for
        // good — this is the earliest point in the row's own lifetime at which it
        // can be watching.
        this.transitions = new TransitionRecorder(ctx);
        this.transitions.watch();
        contributeNode(ctx, { role: 'core', tier: 'L2', label: 'Runtime graph' });
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
    snapshot(query = {}) {
        const all = projectTree(this.ctx, this.transitions);
        this.transitions.prune(new Set(all.map(node => node.entryId)));
        let nodes = all;
        if (query.entryId !== undefined) {
            nodes = descendants(nodes, query.entryId);
        }
        if (query.lifecycle !== undefined) {
            const wanted = new Set(query.lifecycle);
            nodes = nodes.filter(node => wanted.has(node.lifecycle));
        }
        if (query.enabled !== undefined) {
            nodes = nodes.filter(node => node.enabled === query.enabled);
        }
        if (query.role !== undefined) {
            const wanted = new Set(query.role);
            nodes = nodes.filter(node => wanted.has(node.role));
        }
        return { capturedAt: Date.now(), nodes, totalNodes: all.length };
    }
}
export default RuntimeGraphService;
//# sourceMappingURL=index.js.map