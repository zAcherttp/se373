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
import z from '@se373/schemastery';
import { stageDigest } from '@se373/digest';
import { buildChunk, Chunker, DEFAULT_SEPARATORS, splitRecursive } from '@se373/chunker';
/**
 * Format-agnostic recursive chunker.
 */
export class RecursiveChunker extends Chunker {
    static name = 'chunker-recursive';
    static Config = z.object({
        size: z.natural().default(900),
        overlap: z.natural().default(120),
        separators: z.array(z.string()),
    });
    size;
    overlap;
    separators;
    chunkerRef;
    constructor(ctx, config = {}) {
        super(ctx);
        this.size = config.size ?? 900;
        this.overlap = config.overlap ?? 120;
        this.separators = config.separators ?? DEFAULT_SEPARATORS;
        if (this.overlap >= this.size) {
            throw new RangeError(`chunker-recursive: overlap ${this.overlap} must be smaller than size ${this.size}`);
        }
        this.chunkerRef = stageDigest(RecursiveChunker.name, {
            size: this.size,
            overlap: this.overlap,
            // Order matters here and is NOT sorted: the ladder is tried in sequence,
            // so two orderings are two chunkers.
            separators: this.separators,
        });
    }
    /** One line a human reads before approving a rebuild. */
    describe() {
        return `recursive, ${this.size} chars with ${this.overlap} overlap`;
    }
    /**
     * Split one document.
     * @param document - the document to split.
     * @returns chunks in document order.
     */
    chunk(document) {
        const spans = splitRecursive(document.text, {
            size: this.size,
            overlap: this.overlap,
            separators: this.separators,
        });
        return spans.map((text, index) => buildChunk(document, index, text));
    }
}
export default RecursiveChunker;
//# sourceMappingURL=index.js.map