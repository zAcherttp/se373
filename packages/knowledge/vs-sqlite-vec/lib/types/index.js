/**
 * `ctx.vectorStore` over sqlite-vec — the default provider.
 *
 * One directory, one manifest, one file per generation. The manifest holds
 * exactly one fact — which generation queries go to — because that is the fact a
 * flip changes, and a flip that had to rewrite several places would be a flip
 * that can half-happen.
 *
 * No native build: `node:sqlite` ships with Node and `sqlite-vec` ships prebuilt
 * platform binaries, so this provider costs nothing at install time beyond a
 * download.
 *
 * @module @se373/vs-sqlite-vec
 */
import { Service } from '@se373/cordis';
import { dshHomePath } from '@se373/home-paths';
import z from '@se373/schemastery';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertComparable, VectorStore } from '@se373/vector-store';
import { GenerationDatabase } from "./database.js";
export * from "./database.js";
/** Filename of a generation. */
function generationFile(dir, id) {
    return join(dir, `gen-${id}.db`);
}
/**
 * Vector storage in per-generation SQLite files.
 */
export class SqliteVecStore extends VectorStore {
    static name = 'vs-sqlite-vec';
    static Config = z.object({
        dir: z.string(),
    });
    /**
     * The physical layout this provider writes.
     *
     * Bumped by hand when the schema in `database.ts` changes shape. It is an
     * input to the generation key, so a bump retires every existing index -- which
     * is the correct and expensive behaviour, and the reason it is a literal
     * somebody has to edit rather than a hash of the DDL that would churn on a
     * whitespace change.
     */
    schemaRef = 'vs-sqlite-vec/v1';
    dir;
    open = new Map();
    constructor(ctx, config = {}) {
        super(ctx);
        this.dir = config.dir ?? dshHomePath('vectors');
        mkdirSync(this.dir, { recursive: true });
    }
    /** Close every handle on unload. */
    async *[Service.init]() {
        yield () => {
            for (const db of this.open.values())
                db.close();
            this.open.clear();
        };
    }
    /** Path of the manifest. */
    get manifestPath() {
        return join(this.dir, 'manifest.json');
    }
    /** Read the manifest, tolerating absence. */
    manifest() {
        if (!existsSync(this.manifestPath))
            return { active: null };
        try {
            return JSON.parse(readFileSync(this.manifestPath, 'utf8'));
        }
        catch {
            // A corrupt manifest means "no active generation", not a crash: every
            // generation file is still intact and re-activating one is a single call.
            return { active: null };
        }
    }
    /** Write the manifest. */
    writeManifest(manifest) {
        writeFileSync(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    /** Every generation id present on disk. */
    ids() {
        return readdirSync(this.dir)
            .filter(name => name.startsWith('gen-') && name.endsWith('.db'))
            .map(name => name.slice('gen-'.length, -'.db'.length));
    }
    /** Open (and cache) a generation, or throw naming what exists. */
    handle(id) {
        const cached = this.open.get(id);
        if (cached !== undefined)
            return cached;
        const path = generationFile(this.dir, id);
        if (!existsSync(path)) {
            throw new Error(`no generation ${id}; present: ${this.ids().join(', ') || '(none)'}`);
        }
        const db = GenerationDatabase.open(path, id);
        this.open.set(id, db);
        return db;
    }
    /**
     * Start a new generation bound to an embedder identity.
     * @param identity - the model that will write every row.
     * @param labels - opaque strings recorded with the generation.
     * @returns the new generation.
     */
    async create(identity, labels = {}) {
        // Time-ordered prefix so a directory listing sorts chronologically, random
        // suffix so two rebuilds started in the same millisecond cannot collide.
        const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
        const db = GenerationDatabase.create(generationFile(this.dir, id), id, {
            fingerprint: identity.fingerprint,
            dims: identity.dims,
            modelId: identity.modelId,
            status: 'building',
            createdAt: Date.now(),
            labels,
        });
        this.open.set(id, db);
        return db.describe();
    }
    /** Every generation, newest first. */
    async list() {
        return this.ids()
            .map(id => this.handle(id).describe())
            .sort((left, right) => right.createdAt - left.createdAt);
    }
    /** The generation queries should go to. */
    async active() {
        const { active } = this.manifest();
        if (active === null)
            return null;
        if (!existsSync(generationFile(this.dir, active)))
            return null;
        return this.handle(active).describe();
    }
    /**
     * Mark a generation ready and make it the active one.
     *
     * The previous active generation is retired rather than dropped, so a flip is
     * reversible by flipping back — which is the point of building alongside.
     * @param id - the generation to flip to.
     */
    async activate(id) {
        const target = this.handle(id);
        const previous = this.manifest().active;
        if (previous !== null && previous !== id && existsSync(generationFile(this.dir, previous))) {
            this.handle(previous).setStatus('retired');
        }
        target.setStatus('ready');
        this.writeManifest({ active: id });
    }
    /**
     * Delete a generation and its storage.
     * @param id - the generation to drop.
     */
    async drop(id) {
        this.open.get(id)?.close();
        this.open.delete(id);
        const path = generationFile(this.dir, id);
        rmSync(path, { force: true });
        // A clean close removes these itself. What this is for is the orphans a
        // process that died mid-write leaves: a later generation reusing the id
        // would otherwise adopt them as its own journal.
        for (const suffix of ['-wal', '-shm'])
            rmSync(`${path}${suffix}`, { force: true });
        if (this.manifest().active === id)
            this.writeManifest({ active: null });
    }
    /**
     * Insert or replace rows.
     * @param id - the generation to write to.
     * @param records - chunk descriptors, positionally paired with the vectors.
     * @param embedded - vectors carrying the fingerprint that produced them.
     */
    async upsert(id, records, embedded) {
        const db = this.handle(id);
        assertComparable(db.describe(), embedded, 'write');
        if (records.length !== embedded.vectors.length) {
            throw new Error(`${records.length} records but ${embedded.vectors.length} vectors`);
        }
        db.upsert(records, embedded.vectors);
    }
    /**
     * Nearest neighbours.
     * @param id - the generation to read.
     * @param embedded - exactly one query vector, carrying its fingerprint.
     * @param k - how many hits to return.
     * @returns hits, nearest first.
     */
    async query(id, embedded, k) {
        const db = this.handle(id);
        assertComparable(db.describe(), embedded, 'read');
        if (embedded.vectors.length !== 1) {
            throw new Error(`query takes exactly one vector, got ${embedded.vectors.length}`);
        }
        return db.query(embedded.vectors[0], k);
    }
    /**
     * Every stored record, without its vector.
     * @param id - the generation to read.
     */
    async *scan(id) {
        // The underlying read is synchronous and paged; the async wrapper is the
        // seam's shape, chosen so a provider that has to page over a network can
        // satisfy it too.
        yield* this.handle(id).records();
    }
    /**
     * Delete rows by key.
     * @param id - the generation to write to.
     * @param keys - record keys; unknown keys are ignored.
     * @returns how many rows were removed.
     */
    async remove(id, keys) {
        return this.handle(id).remove(keys);
    }
}
export default SqliteVecStore;
//# sourceMappingURL=index.js.map