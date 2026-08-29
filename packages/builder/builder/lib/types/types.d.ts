/**
 * What the builder emits, and what it emits it into.
 *
 * @module @se373/builder/types
 */
/** One loader row of a resolved spec. */
export interface SpecRow {
    /** Row id, unique within the fabricated subtree. */
    readonly id: string;
    /** The module the row names. */
    readonly name: string;
    /** Config for that module. */
    readonly config?: Readonly<Record<string, unknown>>;
    /**
     * Mounted but inert.
     *
     * A `blocked`-tier block becomes a disabled row rather than an omitted one:
     * invariant I2 says connecting an external system *upgrades* an agent and
     * never *enables* it, and a row you cannot see is a row you cannot turn on.
     */
    readonly disabled?: boolean;
    /** The block this row came from, as `id@version`. */
    readonly block: string;
}
/**
 * A resolved agent, as a value.
 *
 * Invariant I4: a pipeline is a named, versioned value. The spec is what gets
 * registered in `ctx.blocks`, diffed against its predecessor, and rolled back
 * to — the running subtree is a consequence of it, never the source of truth.
 */
export interface AgentSpec {
    /** Human-facing name; also the isolation realm label. */
    readonly name: string;
    /** Monotonic from 1, per name. */
    readonly version: number;
    /** The recipe this came from, if any. */
    readonly recipe: string | null;
    /** The agent preset a session joins. */
    readonly preset: string;
    /** The prompt the recipe prefilled, or the caller's intent. */
    readonly prompt: string;
    /** The rows, in mount order. */
    readonly rows: readonly SpecRow[];
    /**
     * Seam keys this spec publishes, and therefore isolates.
     *
     * §6.3's collision rule, applied at build time rather than discovered at
     * demo time: a row publishing into the **root** realm is process-global, so a
     * second fabrication of the same seam would silently resolve one instance for
     * everybody. Isolating exactly what the spec provides is what lets two
     * fabricated agents coexist — and it isolates *only* that, so leaf resources
     * deliberately shared stay shared.
     */
    readonly isolates: readonly string[];
}
/** Something the caller should know before approving. */
export interface BuildWarning {
    /** The block it concerns. */
    readonly block: string;
    /** What is wrong, phrased for a human. */
    readonly message: string;
}
/** A resolved spec awaiting approval. */
export interface BuildPlan {
    /** The plan gate's id, when a gate is mounted; `null` when it is not. */
    readonly planId: string | null;
    /** Digest of {@link spec}; what an approval binds to. */
    readonly digest: string;
    /** The resolved value. */
    readonly spec: AgentSpec;
    /** The block reference the spec was registered under, `id@version`. */
    readonly specRef: string;
    /** Blocks that were excluded or degraded, and why. */
    readonly warnings: readonly BuildWarning[];
}
/** A fabricated agent, running. */
export interface FabricatedAgent {
    /** The loader entry id of the subtree's group row. */
    readonly entryId: string;
    /** The spec it was built from. */
    readonly spec: AgentSpec;
    /** `id@version` of the registered spec block. */
    readonly specRef: string;
    /** The plan that authorised it, when a gate was mounted. */
    readonly planId: string | null;
    /** Epoch milliseconds. */
    readonly createdAt: number;
}
/** What to build. */
export interface BuildRequest {
    /** A recipe id from the cookbook. */
    readonly recipe?: string;
    /** Free-form intent, recorded on the spec. Defaults to the recipe's prompt. */
    readonly intent?: string;
    /** Name for the fabricated agent. Defaults to the recipe's id. */
    readonly name?: string;
    /** Block ids to compose. Defaults to the recipe's list. */
    readonly blocks?: readonly string[];
}
//# sourceMappingURL=types.d.ts.map