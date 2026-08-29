/**
 * `ctx.builder` — intent becomes a resolved agent, and only then a running one.
 *
 * Three separate acts, deliberately not one:
 *
 * 1. **Resolve.** A recipe or a block list becomes an {@link AgentSpec} — a
 *    named, versioned value (I4), registered in `ctx.blocks` like anything else.
 *    Nothing runs; nothing is written outside the repository.
 * 2. **Approve.** The spec is digested and proposed to `ctx.planGate`. Nothing
 *    is fabricated before a human said yes to *that digest* (I8).
 * 3. **Fabricate.** The spec becomes a live Cordis subtree through the loader,
 *    so it appears on the runtime graph by itself (I5) and unwinds with one
 *    disposer (I6). There is no "show the new agent" feature to write, and a
 *    failed fabrication leaves no wreckage — which is what makes attempting one
 *    live a reasonable thing to do.
 *
 * **The model authors implementations, never seam contracts (I1).** Everything
 * here composes existing blocks: the builder chooses *which* rows and *what
 * config*, and cannot invent a seam. Authoring a new provider behind an existing
 * seam is phase 6d, and it arrives as a block with `origin: 'agent'` that this
 * registry already refuses to mount until its suite passes.
 *
 * @module @se373/builder
 */
import { Context, Service } from '@se373/cordis';
import type { Block } from '@se373/block-registry';
import type { BuildPlan, BuildRequest, FabricatedAgent } from './types.ts';
export { renderAgentComposition, renderPresetMetadata, scaffoldTree } from './preset.ts';
export * from './types.ts';
declare module '@se373/cordis' {
    interface Context {
        builder: AgentBuilder;
    }
    interface Events {
        /**
         * A spec was resolved and registered.
         * @param plan - the resolved spec, its digest and its warnings.
         * @mode emit
         */
        'builder/planned'(plan: BuildPlan): void;
        /**
         * A spec became a live subtree.
         * @param agent - the fabricated agent.
         * @mode emit
         */
        'builder/fabricated'(agent: FabricatedAgent): void;
        /**
         * A fabricated subtree was removed.
         * @param agent - the agent that was dismantled.
         * @mode emit
         */
        'builder/dismantled'(agent: FabricatedAgent): void;
    }
}
/** `ctx.vectorStore` → `vectorStore`; anything else is returned unchanged. */
export declare function seamKey(seam: string): string;
/**
 * Service names a block publishes.
 *
 * `provides` when it declares one, the seam's key otherwise. Two fields rather
 * than one because they answer different questions: a seam is what gets
 * *isolated*, and `provides` is what a sibling row can *inject*. Core services
 * have the second and not the first.
 * @param block - the block, or `undefined`.
 * @returns the service names, possibly empty.
 */
export declare function providedBy(block: Block | undefined): string[];
/**
 * The builder.
 */
export declare class AgentBuilder extends Service {
    static readonly name = "builder";
    static inject: readonly ["blocks", "loader"];
    private readonly agents;
    private readonly plans;
    constructor(ctx: Context);
    /** The gate, when one is mounted. */
    private get gate();
    /** Read a recipe's prefill, or fail naming the cookbook. */
    private recipeOf;
    /**
     * Turn a request into a resolved, registered, digested spec.
     *
     * Blocks are resolved one at a time and every failure becomes a warning
     * rather than an exception: a plan that cannot be produced is a plan nobody
     * can look at, and the whole point of a plan card is to show a human what is
     * about to happen *including* the parts that will not.
     * @param request - a recipe, a block list, or both.
     * @returns the plan, proposed to the gate when one is mounted.
     */
    plan(request: BuildRequest): Promise<BuildPlan>;
    /** The plan card's steps, in the order they will happen. */
    private steps;
    /**
     * Mount a planned spec as a live subtree.
     *
     * The gate is consumed *before* anything is created, so a rejected or
     * mismatched approval leaves the tree untouched rather than half-built.
     * @param digest - the plan's digest, from {@link plan}.
     * @returns the running agent.
     * @throws when the plan is unknown, or the gate refuses.
     */
    fabricate(digest: string): Promise<FabricatedAgent>;
    /** Where fabricated agents' scaffolds live. */
    static workspacesRoot(): string;
    /**
     * The fabricated subtree's own preset roster.
     *
     * This is the object a session-creating caller mounts through:
     * `agents.create({ setup: agentCtx => presetsOf(id).mount(agentCtx, presetId) })`.
     * Read from the roster row's own fiber context because the service is
     * isolated into the subtree's realm — that isolation is what keeps the
     * fabricated persona out of the main picker, and it is also why the root
     * context cannot see it.
     * @param entryId - the id returned by {@link fabricate}.
     * @returns the subtree's `agentPresets` service.
     */
    presetsOf(entryId: string): unknown;
    /** Every fabricated agent still mounted, newest first. */
    list(): FabricatedAgent[];
    /**
     * Remove a fabricated subtree.
     *
     * One disposer, because that is what a Cordis subtree is (I6). The spec it was
     * built from stays in the repository — dismantling a running agent is not the
     * same as forgetting how it was built, and the version you would roll back to
     * has to survive.
     * @param entryId - the id returned by {@link fabricate}.
     */
    dismantle(entryId: string): Promise<void>;
}
export default AgentBuilder;
//# sourceMappingURL=index.d.ts.map