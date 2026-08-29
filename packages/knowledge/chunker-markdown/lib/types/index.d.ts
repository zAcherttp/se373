/**
 * `ctx.chunker` for Markdown — splits at headings first, recursively within.
 *
 * The reason to prefer it for a Markdown corpus is not tidiness, it is that
 * **the heading travels with the chunk**. A span reading "it is computed, never
 * declared" is close to useless on its own and highly retrievable once it
 * carries `The generation key is a fingerprint, not a flag` as its title —
 * which is also what makes the retrieved context legible to a model.
 *
 * Sections longer than the target size fall through to the same recursive
 * splitter `chunker-recursive` uses, and **every** resulting span gets the
 * heading prepended — not just the first. Sections shorter than `minSize` are
 * merged forward into the next one, because a corpus of documentation is full
 * of two-line sections whose own text says nothing.
 *
 * @module @se373/chunker-markdown
 */
import { Context } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import { Chunker } from '@se373/chunker';
import type { Chunk } from '@se373/chunker';
import type { Document } from '@se373/corpus';
/** Configuration for the Markdown chunker. */
export interface Config {
    /** Target characters per chunk; longer sections are split recursively. */
    readonly size?: number;
    /** Characters repeated between adjacent chunks of one oversized section. */
    readonly overlap?: number;
    /** Sections shorter than this are merged into the following section. */
    readonly minSize?: number;
}
/** One heading and the text beneath it. */
interface Section {
    readonly heading: string | null;
    readonly text: string;
}
/**
 * Split a Markdown document into heading-delimited sections.
 *
 * Fenced code is tracked so that a `#` comment inside a shell block is not
 * mistaken for a heading — which would otherwise cut a document apart at every
 * commented command, and `docs/` here is full of them.
 * @param text - the document.
 * @returns sections in document order.
 */
export declare function sections(text: string): Section[];
/**
 * Heading-aware Markdown chunker.
 */
export declare class MarkdownChunker extends Chunker {
    static readonly name = "chunker-markdown";
    static readonly Config: Schema<Config>;
    private readonly size;
    private readonly overlap;
    private readonly minSize;
    readonly chunkerRef: string;
    constructor(ctx: Context, config?: Config);
    /** One line a human reads before approving a rebuild. */
    describe(): string;
    /**
     * Split one document at its headings.
     * @param document - the document to split.
     * @returns chunks in document order, each titled with its section heading.
     */
    chunk(document: Document): Chunk[];
}
export default MarkdownChunker;
//# sourceMappingURL=index.d.ts.map