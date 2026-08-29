/**
 * What a chunker produces.
 *
 * @module @se373/chunker/types
 */
/** One indexable span of one document. */
export interface Chunk {
    /**
     * Stable key, `<documentId>#<index>`.
     *
     * Stability is what makes re-ingest an update rather than a duplication: the
     * store upserts by this key, so re-chunking a document that grew replaces its
     * first N chunks and appends the rest. It also means a document that *shrank*
     * leaves orphans, which the pipeline sweeps — see `@se373/knowledge`.
     */
    readonly key: string;
    /** The document this came from. */
    readonly documentId: string;
    /** Position within the document, from zero. */
    readonly index: number;
    /** The text to embed. */
    readonly text: string;
    /** The document's title, or the section heading this chunk fell under. */
    readonly title: string | null;
    /**
     * The **document's** content hash, not this chunk's.
     *
     * Incremental re-ingest asks "has this document changed", and the answer has
     * to be readable from the index without re-chunking to find out. Carrying the
     * document's hash on every chunk makes that a lookup; carrying the chunk's own
     * hash would answer a question nobody asks.
     */
    readonly documentHash: string;
    /** Whatever the document carried, plus anything the chunker adds. */
    readonly metadata: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map