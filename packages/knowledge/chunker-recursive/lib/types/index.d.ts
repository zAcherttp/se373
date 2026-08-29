/**
 * `ctx.chunker` by recursive character splitting — the format-agnostic default.
 *
 * Tries progressively finer separators — paragraph, line, sentence, clause,
 * word — and merges the pieces greedily up to a target size, repeating a tail
 * of each chunk at the head of the next so a span that straddles a boundary is
 * still retrievable from both sides.
 *
 * It knows nothing about the document's format, which is exactly why it is the
 * default: a corpus of mixed prose, code and configuration has no structure a
 * format-aware splitter could agree on, and guessing wrong costs more than not
 * guessing.
 *
 * @module @se373/chunker-recursive
 */
import { Context } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import { Chunker } from '@se373/chunker';
import type { Chunk } from '@se373/chunker';
import type { Document } from '@se373/corpus';
/** Configuration for the recursive chunker. */
export interface Config {
    /** Target characters per chunk. */
    readonly size?: number;
    /** Characters repeated between adjacent chunks. Must be smaller than `size`. */
    readonly overlap?: number;
    /** Separators tried in order, coarsest first. */
    readonly separators?: readonly string[];
}
/**
 * Format-agnostic recursive chunker.
 */
export declare class RecursiveChunker extends Chunker {
    static readonly name = "chunker-recursive";
    static readonly Config: Schema<Config>;
    private readonly size;
    private readonly overlap;
    private readonly separators;
    readonly chunkerRef: string;
    constructor(ctx: Context, config?: Config);
    /** One line a human reads before approving a rebuild. */
    describe(): string;
    /**
     * Split one document.
     * @param document - the document to split.
     * @returns chunks in document order.
     */
    chunk(document: Document): Chunk[];
}
export default RecursiveChunker;
//# sourceMappingURL=index.d.ts.map