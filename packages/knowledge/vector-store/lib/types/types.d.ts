/**
 * The vocabulary of the vector store seam.
 *
 * One idea shapes all of it: **a generation is the unit, and its embedder
 * identity is a property of the generation, not of the rows inside it.**
 *
 * The tempting alternative is to tag each stored chunk with the model that
 * produced it. It is worse, and not by a little: per-row model metadata makes a
 * mixed-model generation *representable*, so an interrupted re-embed can leave
 * an index that is half one model and half another, and every query against it
 * returns confident nonsense with nothing raising an error. Binding identity to
 * the generation makes that state unspellable — a row's membership in a
 * generation is what says which model made it.
 *
 * What rows do carry is a content key, because incremental re-ingest needs to
 * know which *source* changed. That is a different question from which model
 * ran, and conflating them is how the first design goes wrong.
 *
 * @module @se373/vector-store/types
 */
/**
 * Where a generation is in its life.
 *
 * Destructive changes are handled by building a new generation alongside the
 * old one, flipping, and dropping — so `building` and `ready` coexist by
 * design, and a failed rebuild simply leaves the previous generation active.
 */
export type GenerationStatus = 'building' | 'ready' | 'retired';
/** One complete index, written by exactly one embedder identity. */
export interface Generation {
    /** Stable local id. */
    readonly id: string;
    /** {@link EmbedderIdentity.fingerprint} of the model that wrote every row. */
    readonly fingerprint: string;
    /** Vector width; fixed at creation because the physical table declares it. */
    readonly dims: number;
    /** Registry row id, for humans. Not an identity input. */
    readonly modelId: string;
    /** Lifecycle position. */
    readonly status: GenerationStatus;
    /** Epoch milliseconds. */
    readonly createdAt: number;
    /** How many vectors are stored. */
    readonly records: number;
    /**
     * Opaque strings the writer attached at creation.
     *
     * The store never interprets these. `@se373/knowledge` uses them to record
     * the generation key and each write-path stage's digest, which is what lets a
     * later boot ask "was this index built by the pipeline I am configured with
     * now, and if not, which stage changed?" — a question the store has no
     * business understanding but every business preserving.
     */
    readonly labels: Readonly<Record<string, string>>;
}
/** A chunk about to be stored, paired positionally with a vector. */
export interface VectorRecord {
    /**
     * The caller's stable id for this chunk.
     *
     * Upserting the same key replaces the row. This is what makes re-ingesting an
     * unchanged corpus idempotent rather than duplicative.
     */
    readonly key: string;
    /** The text that was embedded, when it is worth keeping alongside. */
    readonly text?: string;
    /** Anything the caller wants back on a hit. Must be JSON-representable. */
    readonly metadata?: Record<string, unknown>;
}
/** One retrieved chunk. */
export interface Hit {
    /** The record's {@link VectorRecord.key}. */
    readonly key: string;
    /** Distance in the store's metric; smaller is nearer. */
    readonly distance: number;
    /** The stored text, or `null` when none was kept. */
    readonly text: string | null;
    /** The stored metadata, or `null`. */
    readonly metadata: Record<string, unknown> | null;
}
//# sourceMappingURL=types.d.ts.map