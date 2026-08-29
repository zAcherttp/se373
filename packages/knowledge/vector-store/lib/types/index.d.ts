/**
 * `ctx.vectorStore` — where vectors live, in generations.
 *
 * A **seam**: pick one. Swapping sqlite-vec for something else is a config-row
 * edit (I3), and the two would not coexist — a second store is a second index,
 * not a second opinion about the same one.
 *
 * Same shape as the embedding seam and for the same reason: a `declare module`
 * plus an abstract base, never a row that "declares" the name. `ctx.provide`
 * claims ownership, so a declaring row would collide with the first real
 * provider.
 *
 * @module @se373/vector-store
 */
import { Context, Service } from '@se373/cordis';
import type { EmbedderIdentity, EmbedResult } from '@se373/embedding';
import type { Generation, Hit, VectorRecord } from './types.ts';
export * from './types.ts';
export { assertComparable } from './guard.ts';
declare module '@se373/cordis' {
    interface Context {
        vectorStore: VectorStore;
    }
}
/**
 * Abstract vector store.
 *
 * Every write and every read takes an {@link EmbedResult} rather than bare
 * vectors, so the producing fingerprint travels with the numbers and the store
 * can refuse a mismatch. A signature taking `Float32Array[]` would make that
 * check optional, and an optional correctness check in a retrieval system is a
 * check that is absent on the day it matters.
 */
export declare abstract class VectorStore extends Service {
    constructor(ctx: Context);
    /**
     * Identity of the physical schema this provider writes.
     *
     * An input to the generation key, because a store that changed its table
     * layout would be reading rows written under different assumptions -- and
     * unlike the other stages, nothing about the data itself would reveal it.
     */
    abstract readonly schemaRef: string;
    /**
     * Start a new generation bound to an embedder identity.
     * @param identity - the model that will write every row.
     * @param labels - opaque strings to record with the generation.
     * @returns the new generation, `status: 'building'`.
     */
    abstract create(identity: EmbedderIdentity, labels?: Readonly<Record<string, string>>): Promise<Generation>;
    /** Every generation, newest first. */
    abstract list(): Promise<Generation[]>;
    /** The generation queries should go to, or `null` if none is active. */
    abstract active(): Promise<Generation | null>;
    /**
     * Mark a generation ready and make it the active one.
     * @param id - the generation to flip to.
     */
    abstract activate(id: string): Promise<void>;
    /**
     * Delete a generation and its storage.
     * @param id - the generation to drop.
     */
    abstract drop(id: string): Promise<void>;
    /**
     * Insert or replace rows.
     * @param id - the generation to write to.
     * @param records - chunk descriptors, positionally paired with `embedded.vectors`.
     * @param embedded - vectors carrying the fingerprint that produced them.
     * @throws when the fingerprint or width disagrees with the generation.
     */
    abstract upsert(id: string, records: readonly VectorRecord[], embedded: EmbedResult): Promise<void>;
    /**
     * Nearest neighbours.
     * @param id - the generation to read.
     * @param embedded - exactly one query vector, carrying its fingerprint.
     * @param k - how many hits to return.
     * @throws when the fingerprint or width disagrees with the generation.
     */
    abstract query(id: string, embedded: EmbedResult, k: number): Promise<Hit[]>;
    /**
     * Every stored record, streamed, without its vector.
     *
     * This is what makes §5.5's positional cascade real rather than aspirational.
     * When only the embedder changed, the chunks are already correct and only the
     * vectors are wrong -- so the previous generation *is* the chunk cache, and a
     * re-embed reads from it instead of re-crawling and re-chunking a corpus that
     * did not move. Without a way to read chunks back, every cascade would be the
     * degenerate full rebuild.
     *
     * Streamed rather than returned as an array because an index is the one thing
     * here whose size is bounded by the corpus rather than by a batch.
     * @param id - the generation to read.
     */
    abstract scan(id: string): AsyncIterable<VectorRecord>;
    /**
     * Delete rows by key.
     *
     * Needed for the orphan sweep: a document that shrank leaves chunks whose
     * keys nothing will upsert over, and an index that answers from text no
     * document contains any more is wrong in the least visible way available.
     * @param id - the generation to write to.
     * @param keys - record keys to remove; unknown keys are ignored.
     * @returns how many rows were removed.
     */
    abstract remove(id: string, keys: readonly string[]): Promise<number>;
}
export default VectorStore;
//# sourceMappingURL=index.d.ts.map