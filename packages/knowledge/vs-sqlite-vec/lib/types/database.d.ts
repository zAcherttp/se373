/**
 * One generation, one SQLite file.
 *
 * That is the whole storage design, and it is what makes the settled
 * "build alongside, flip, then drop" mechanism cheap: a rebuild is a second
 * file, a flip is one line in a manifest, and a drop is `unlink`. Sharing one
 * database between generations would make every one of those a transaction
 * against data that is being read concurrently.
 *
 * `node:sqlite` rather than a native driver: the extension loads through
 * `DatabaseSync(..., { allowExtension: true })` and `sqlite-vec` ships prebuilt
 * platform binaries, so nothing here needs a compiler.
 *
 * @module @se373/vs-sqlite-vec/database
 */
import type { Generation, GenerationStatus, Hit, VectorRecord } from '@se373/vector-store';
/** The metadata a generation file carries about itself. */
interface Meta {
    readonly fingerprint: string;
    readonly dims: number;
    readonly modelId: string;
    readonly status: GenerationStatus;
    readonly createdAt: number;
    /** Opaque writer labels, stored under a `label:` key prefix. */
    readonly labels: Readonly<Record<string, string>>;
}
/**
 * An open generation database.
 *
 * Deliberately not a Service: a generation's lifetime is shorter than a
 * plugin's and several are open at once during a rebuild, so ownership belongs
 * to the store that opened them.
 */
export declare class GenerationDatabase {
    readonly id: string;
    private readonly db;
    private constructor();
    /** Open a file and load the vector extension into it. */
    private static connect;
    /**
     * Create a generation file and its schema.
     * @param path - where the file goes.
     * @param id - the generation id.
     * @param meta - identity binding, fixed for the file's life.
     * @returns the open database.
     */
    static create(path: string, id: string, meta: Meta): GenerationDatabase;
    /**
     * Open an existing generation file.
     * @param path - the file.
     * @param id - the generation id.
     * @returns the open database.
     */
    static open(path: string, id: string): GenerationDatabase;
    /** Read the whole meta table. */
    private meta;
    /** This generation, as the seam describes it. */
    describe(): Generation;
    /**
     * Move this generation's lifecycle position.
     * @param status - the new status.
     */
    setStatus(status: GenerationStatus): void;
    /**
     * Insert or replace rows.
     *
     * Wrapped in one transaction because a partially written batch is a
     * generation whose `records` count and vector count disagree, and nothing
     * downstream would notice until a query returned a row with no vector.
     * @param records - chunk descriptors.
     * @param vectors - positionally paired vectors.
     */
    upsert(records: readonly VectorRecord[], vectors: readonly Float32Array[]): void;
    /**
     * Nearest neighbours of one vector.
     * @param vector - the query vector.
     * @param k - how many hits.
     * @returns hits, nearest first.
     */
    query(vector: Float32Array, k: number): Hit[];
    /**
     * Every stored record, without its vector, in insertion order.
     *
     * Paged rather than read whole: this is the chunk-cache read behind a
     * re-embed, so it runs over the entire index by definition, and the point of
     * streaming it is not to hold the corpus in memory while doing so.
     * @param batch - rows per page.
     */
    records(batch?: number): Generator<VectorRecord>;
    /**
     * Delete rows by key.
     * @param keys - record keys; unknown keys are ignored.
     * @returns how many rows were removed.
     */
    remove(keys: readonly string[]): number;
    /** Close the handle. */
    close(): void;
}
export {};
//# sourceMappingURL=database.d.ts.map