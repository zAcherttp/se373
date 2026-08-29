/**
 * Recursive character splitting, shared by both chunker providers.
 *
 * It lives in the seam owner rather than in `chunker-recursive` because
 * `chunker-markdown` needs exactly the same behaviour for the sections that are
 * too long to stand alone. The alternative — one provider importing another —
 * would make the Markdown chunker's output depend on a package a config row can
 * disable.
 *
 * **Sizes are in characters, not tokens.** A token-aware splitter would have to
 * reach the tokenizer, which belongs to the embedder, which comes *after* the
 * chunker in the write-path cascade — so a chunker that measured tokens would
 * invalidate itself whenever the model changed, cascading a re-chunk that the
 * positional rule says is unnecessary. Overshooting the model's token budget is
 * handled where it belongs, by truncation at embed time.
 *
 * @module @se373/chunker/split
 */
/** How to split. */
export interface SplitOptions {
    /** Target characters per chunk. Not a hard cap: a single unsplittable run may exceed it. */
    readonly size: number;
    /** Characters of trailing context repeated at the start of the next chunk. */
    readonly overlap: number;
    /** Separators tried in order, coarsest first. */
    readonly separators: readonly string[];
}
/** The default ladder: paragraph, line, sentence, clause, word. */
export declare const DEFAULT_SEPARATORS: readonly string[];
/**
 * Split text into chunks of roughly `size` characters.
 * @param text - the text to split.
 * @param options - target size, overlap, and the separator ladder.
 * @returns non-empty, trimmed chunks in document order.
 */
export declare function splitRecursive(text: string, options: SplitOptions): string[];
//# sourceMappingURL=split.d.ts.map