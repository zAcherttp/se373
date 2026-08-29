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
import { Service } from '@se373/cordis';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dshHomePath } from '@se373/home-paths';
import z from '@se373/schemastery';
import { contributeNode } from '@se373/runtime-graph';
export * from "./types.js";
/**
 * The block repository.
 */
export class BlockRepository extends Service {
    static name = 'block-registry';
    static Config = z.object({
        file: z.string(),
    });
    /** id → every version, oldest first. */
    history = new Map();
    file;
    constructor(ctx, config = {}) {
        super(ctx, 'blocks');
        this.file = config.file ?? dshHomePath('blocks', 'repository.json');
        this.load();
        contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Block repository' });
    }
    /** Read persisted non-system blocks, tolerating absence and corruption. */
    load() {
        if (!existsSync(this.file))
            return;
        try {
            const stored = JSON.parse(readFileSync(this.file, 'utf8'));
            for (const block of stored) {
                const versions = this.history.get(block.id) ?? [];
                versions.push(block);
                this.history.set(block.id, versions);
            }
        }
        catch {
            // A corrupt repository means "no authored blocks", not a crash: every
            // system block is re-registered from its own row, so the harness still
            // boots with a complete cookbook and only forks are missing.
            this.history.clear();
        }
    }
    /** Persist everything that did not come from a row. */
    save() {
        const durable = [...this.history.values()].flat().filter(block => block.origin !== 'system');
        if (durable.length === 0 && !existsSync(this.file))
            return;
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, `${JSON.stringify(durable, null, 2)}\n`);
    }
    /**
     * Write a block version.
     *
     * Registering an id that already exists appends a version rather than
     * replacing one — that is what makes the repository a repository, and what
     * lets a comparison name `id@version` and still find it later.
     * @param input - the block, without its version or timestamp.
     * @returns the written version.
     */
    register(input) {
        const versions = this.history.get(input.id) ?? [];
        const block = {
            ...input,
            version: (versions.at(-1)?.version ?? 0) + 1,
            createdAt: Date.now(),
        };
        versions.push(block);
        this.history.set(block.id, versions);
        if (block.origin !== 'system')
            this.save();
        this.ctx.emit('blocks/registered', block);
        return block;
    }
    /**
     * The newest version of a block.
     * @param id - the block id.
     * @returns the block, or `undefined`.
     */
    get(id) {
        return this.history.get(id)?.at(-1);
    }
    /**
     * One specific version.
     * @param id - the block id.
     * @param version - the version number, from 1.
     * @returns the block, or `undefined`.
     */
    at(id, version) {
        return this.history.get(id)?.find(block => block.version === version);
    }
    /**
     * Every version of a block, oldest first.
     * @param id - the block id.
     * @returns the history, empty when unknown.
     */
    versions(id) {
        return [...this.history.get(id) ?? []];
    }
    /**
     * The newest version of every block, narrowed.
     * @param query - optional filters; an omitted field filters nothing.
     * @returns matching blocks.
     */
    list(query = {}) {
        const out = [];
        for (const versions of this.history.values()) {
            const block = versions.at(-1);
            if (block === undefined)
                continue;
            if (query.kind !== undefined && block.kind !== query.kind)
                continue;
            if (query.origin !== undefined && block.origin !== query.origin)
                continue;
            if (query.seam !== undefined && block.manifest.seam !== query.seam)
                continue;
            if (query.tier !== undefined && block.manifest.tier !== query.tier)
                continue;
            out.push(block);
        }
        return out.sort((left, right) => (left.id < right.id ? -1 : 1));
    }
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
    fork(id, changes) {
        const source = this.get(id);
        if (source === undefined)
            throw new Error(`no block ${JSON.stringify(id)} to fork`);
        const forkId = changes.id ?? `${id}.fork-${this.nextForkOrdinal(id)}`;
        if (forkId === id)
            throw new Error(`a fork may not reuse the id ${JSON.stringify(id)}`);
        return this.register({
            id: forkId,
            kind: source.kind,
            origin: changes.origin,
            forkedFrom: `${source.id}@${source.version}`,
            ...source.conformance === undefined ? {} : { conformance: source.conformance },
            manifest: { ...source.manifest, ...changes.manifest },
        });
    }
    /** The next unused `.fork-N` ordinal for an id. */
    nextForkOrdinal(id) {
        let ordinal = 1;
        while (this.history.has(`${id}.fork-${ordinal}`))
            ordinal += 1;
        return ordinal;
    }
    /**
     * Whether policy lets a block mount now.
     *
     * The one place `origin` does work rather than decorate. An agent-authored
     * block is not distrusted because of who wrote it in the abstract — it is
     * distrusted until the suite its seam ships says otherwise, which is I7.
     * @param id - the block id.
     * @returns the verdict and the rule behind it.
     */
    mountable(id) {
        const block = this.get(id);
        if (block === undefined)
            return { allowed: false, reason: `no block ${id}` };
        if (block.origin !== 'agent') {
            return { allowed: true, reason: `${block.origin}-authored blocks mount directly` };
        }
        if (block.conformance === undefined) {
            return {
                allowed: false,
                reason: `${id} is agent-authored and names no conformance suite; nothing could vouch for it`,
            };
        }
        return {
            allowed: false,
            reason: `${id} is agent-authored and must pass the ${block.conformance} suite before mounting`,
        };
    }
    /** Where non-system blocks are persisted. */
    get path() {
        return this.file;
    }
}
export default BlockRepository;
/** Join a block id and version the way `forkedFrom` records it. */
export function blockRef(block) {
    return `${block.id}@${block.version}`;
}
/** Split a `id@version` reference. */
export function parseBlockRef(ref) {
    const at = ref.lastIndexOf('@');
    if (at <= 0)
        return null;
    const version = Number(ref.slice(at + 1));
    if (!Number.isInteger(version) || version < 1)
        return null;
    return { id: ref.slice(0, at), version };
}
//# sourceMappingURL=index.js.map