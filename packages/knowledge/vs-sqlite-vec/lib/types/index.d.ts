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
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import { VectorStore } from '@se373/vector-store';
import type { EmbedderIdentity, EmbedResult } from '@se373/embedding';
import type { Generation, Hit, VectorRecord } from '@se373/vector-store';
export * from './database.ts';
/** Configuration for the sqlite-vec store. */
export interface Config {
    /** Directory holding the manifest and generation files. Defaults to `$SE373_HOME/vectors`. */
    readonly dir?: string;
}
/**
 * Vector storage in per-generation SQLite files.
 */
export declare class SqliteVecStore extends VectorStore {
    static readonly name = "vs-sqlite-vec";
    static readonly Config: Schema<Config>;
    /**
     * The physical layout this provider writes.
     *
     * Bumped by hand when the schema in `database.ts` changes shape. It is an
     * input to the generation key, so a bump retires every existing index -- which
     * is the correct and expensive behaviour, and the reason it is a literal
     * somebody has to edit rather than a hash of the DDL that would churn on a
     * whitespace change.
     */
    readonly schemaRef = "vs-sqlite-vec/v1";
    private readonly dir;
    private readonly open;
    constructor(ctx: Context, config?: Config);
    /** Close every handle on unload. */
    [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void>;
    /** Path of the manifest. */
    private get manifestPath();
    /** Read the manifest, tolerating absence. */
    private manifest;
    /** Write the manifest. */
    private writeManifest;
    /** Every generation id present on disk. */
    private ids;
    /** Open (and cache) a generation, or throw naming what exists. */
    private handle;
    /**
     * Start a new generation bound to an embedder identity.
     * @param identity - the model that will write every row.
     * @param labels - opaque strings recorded with the generation.
     * @returns the new generation.
     */
    create(identity: EmbedderIdentity, labels?: Readonly<Record<string, string>>): Promise<Generation>;
    /** Every generation, newest first. */
    list(): Promise<Generation[]>;
    /** The generation queries should go to. */
    active(): Promise<Generation | null>;
    /**
     * Mark a generation ready and make it the active one.
     *
     * The previous active generation is retired rather than dropped, so a flip is
     * reversible by flipping back — which is the point of building alongside.
     * @param id - the generation to flip to.
     */
    activate(id: string): Promise<void>;
    /**
     * Delete a generation and its storage.
     * @param id - the generation to drop.
     */
    drop(id: string): Promise<void>;
    /**
     * Insert or replace rows.
     * @param id - the generation to write to.
     * @param records - chunk descriptors, positionally paired with the vectors.
     * @param embedded - vectors carrying the fingerprint that produced them.
     */
    upsert(id: string, records: readonly VectorRecord[], embedded: EmbedResult): Promise<void>;
    /**
     * Nearest neighbours.
     * @param id - the generation to read.
     * @param embedded - exactly one query vector, carrying its fingerprint.
     * @param k - how many hits to return.
     * @returns hits, nearest first.
     */
    query(id: string, embedded: EmbedResult, k: number): Promise<Hit[]>;
    /**
     * Every stored record, without its vector.
     * @param id - the generation to read.
     */
    scan(id: string): AsyncIterable<VectorRecord>;
    /**
     * Delete rows by key.
     * @param id - the generation to write to.
     * @param keys - record keys; unknown keys are ignored.
     * @returns how many rows were removed.
     */
    remove(id: string, keys: readonly string[]): Promise<number>;
}
export default SqliteVecStore;
//# sourceMappingURL=index.d.ts.map