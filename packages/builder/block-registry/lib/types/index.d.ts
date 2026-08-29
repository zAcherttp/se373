/**
 * `ctx.blocks` — a **repository**, not a catalog.
 *
 * The distinction is the whole design. A catalog is read-only and populated at
 * mount from whatever was vendored; a repository has a write path, versions,
 * parentage, and a namespace for entries that did not come from the vendor. The
 * deciding argument is provenance: the moment a block carries `origin`, entries
 * can come from somewhere other than the vendor, and a catalog cannot express
 * that. Retrofitting a write path into a catalog is a rewrite of the registry;
 * starting with a repository that happens to be full of system-authored entries
 * costs almost nothing.
 *
 * **One registry, keyed by `kind`.** Keeping it single is what makes "compare
 * two retrieval pipelines" and "compare two agents" differ only in which blocks
 * the rows name — the comparison machinery gets written once.
 *
 * **Forks are new ids in a separate namespace, never in-place edits.** The
 * original is untouched by construction rather than by policy, which is also why
 * you can still compare against it: you cannot compare against a version you
 * mutated away.
 *
 * @module @se373/block-registry
 */
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import type { Block, BlockKind, BlockOrigin, BlockQuery, MountVerdict } from './types.ts';
export * from './types.ts';
declare module '@se373/cordis' {
    interface Context {
        blocks: BlockRepository;
    }
    interface Events {
        /**
         * A block version was written.
         * @param block - the new version.
         * @mode emit
         */
        'blocks/registered'(block: Block): void;
    }
}
/** What a caller supplies to register a version. */
export interface BlockInput extends Omit<Block, 'version' | 'createdAt'> {
    readonly version?: never;
    readonly createdAt?: never;
}
/** Configuration for the block repository. */
export interface Config {
    /**
     * Where non-system blocks are persisted.
     *
     * Defaults to `$SE373_HOME/blocks/repository.json`. System blocks are never
     * written: they are re-registered by their own rows at every boot, so
     * persisting them would create a second, staler source for something the
     * config already decides.
     */
    readonly file?: string;
}
/**
 * The block repository.
 */
export declare class BlockRepository extends Service {
    static readonly name = "block-registry";
    static readonly Config: Schema<Config>;
    /** id → every version, oldest first. */
    private readonly history;
    /** `id@version` of blocks whose conformance suite has passed. Persisted. */
    private readonly certified;
    private readonly file;
    constructor(ctx: Context, config?: Config);
    /** Read persisted non-system blocks, tolerating absence and corruption. */
    private load;
    /** Persist everything that did not come from a row. */
    private save;
    /**
     * Write a block version.
     *
     * Registering an id that already exists appends a version rather than
     * replacing one — that is what makes the repository a repository, and what
     * lets a comparison name `id@version` and still find it later.
     * @param input - the block, without its version or timestamp.
     * @returns the written version.
     */
    register(input: BlockInput): Block;
    /**
     * The newest version of a block.
     * @param id - the block id.
     * @returns the block, or `undefined`.
     */
    get(id: string): Block | undefined;
    /**
     * One specific version.
     * @param id - the block id.
     * @param version - the version number, from 1.
     * @returns the block, or `undefined`.
     */
    at(id: string, version: number): Block | undefined;
    /**
     * Every version of a block, oldest first.
     * @param id - the block id.
     * @returns the history, empty when unknown.
     */
    versions(id: string): Block[];
    /**
     * The newest version of every block, narrowed.
     * @param query - optional filters; an omitted field filters nothing.
     * @returns matching blocks.
     */
    list(query?: BlockQuery): Block[];
    /**
     * Derive a new block from an existing one.
     *
     * The fork gets its own id in a separate namespace and records its parent as
     * `id@version`. It never shadows the original, which therefore survives by
     * construction — the property that makes a failed evolution recoverable and a
     * v1-vs-v2 comparison possible at all.
     * @param id - the block to derive from.
     * @param changes - manifest fields to override, and the new origin.
     * @returns the forked block.
     * @throws when the source id is unknown.
     */
    fork(id: string, changes: {
        readonly origin: BlockOrigin;
        readonly id?: string;
        readonly manifest?: Partial<Block['manifest']>;
    }): Block;
    /** The next unused `.fork-N` ordinal for an id. */
    private nextForkOrdinal;
    /**
     * Whether policy lets a block mount now.
     *
     * The one place `origin` does work rather than decorate. An agent-authored
     * block is not distrusted because of who wrote it in the abstract — it is
     * distrusted until the suite its seam ships says otherwise, which is I7.
     * @param id - the block id.
     * @returns the verdict and the rule behind it.
     */
    mountable(id: string): MountVerdict;
    /**
     * Record that a block's newest version passed its conformance suite.
     *
     * Certification is **per version**, because it vouches for bytes: a later
     * `register` of the same id is new code the suite has not seen, and it starts
     * uncertified. Only the authoring pipeline calls this, after the suite it
     * names actually ran — certifying is the one write that turns `origin:
     * 'agent'` from a refusal into a mount, so it must never be reachable as a
     * side effect of anything else.
     * @param id - the block id; its newest version is what gets certified.
     * @returns the certified block.
     * @throws when the block is unknown or names no conformance suite.
     */
    certify(id: string): Block;
    /**
     * Withdraw a certification.
     *
     * The staging gate calls this when a certified fork's bytes change and the
     * new bytes fail their suite: the registry must stop vouching for a version
     * whose on-disk source no longer matches what passed. The block and its
     * versions survive — decertifying is not deletion — but `mountable` refuses
     * again until something re-passes.
     * @param id - the block id; every version's certification is withdrawn.
     */
    decertify(id: string): void;
    /** Where non-system blocks are persisted. */
    get path(): string;
}
export default BlockRepository;
/** Join a block id and version the way `forkedFrom` records it. */
export declare function blockRef(block: Pick<Block, 'id' | 'version'>): string;
/** Split a `id@version` reference. */
export declare function parseBlockRef(ref: string): {
    id: string;
    version: number;
} | null;
/** Every kind a caller may pass, re-exported for tools that enumerate them. */
export type { BlockKind as Kind };
//# sourceMappingURL=index.d.ts.map