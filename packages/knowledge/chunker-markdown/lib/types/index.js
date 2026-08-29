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
import z from '@se373/schemastery';
import { stageDigest } from '@se373/digest';
import { buildChunk, Chunker, DEFAULT_SEPARATORS, splitRecursive } from '@se373/chunker';
/** An ATX heading line, capturing depth and text. */
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
/** A fenced code block delimiter. */
const FENCE = /^\s*(```|~~~)/;
/**
 * Split a Markdown document into heading-delimited sections.
 *
 * Fenced code is tracked so that a `#` comment inside a shell block is not
 * mistaken for a heading — which would otherwise cut a document apart at every
 * commented command, and `docs/` here is full of them.
 * @param text - the document.
 * @returns sections in document order.
 */
export function sections(text) {
    const out = [];
    let heading = null;
    let body = [];
    let fence = null;
    const flush = () => {
        const joined = body.join('\n').trim();
        if (joined !== '' || heading !== null)
            out.push({ heading, text: joined });
        body = [];
    };
    for (const line of text.split('\n')) {
        const fenceMatch = FENCE.exec(line);
        if (fenceMatch !== null) {
            // Only a matching delimiter closes a fence; ``` inside a ~~~ block is text.
            if (fence === null)
                fence = fenceMatch[1];
            else if (fence === fenceMatch[1])
                fence = null;
            body.push(line);
            continue;
        }
        const headingMatch = fence === null ? HEADING.exec(line) : null;
        if (headingMatch !== null) {
            flush();
            heading = headingMatch[2];
            continue;
        }
        body.push(line);
    }
    flush();
    return out.filter(section => section.text !== '' || section.heading !== null);
}
/**
 * Heading-aware Markdown chunker.
 */
export class MarkdownChunker extends Chunker {
    static name = 'chunker-markdown';
    static Config = z.object({
        size: z.natural().default(900),
        overlap: z.natural().default(120),
        minSize: z.natural().default(200),
    });
    size;
    overlap;
    minSize;
    chunkerRef;
    constructor(ctx, config = {}) {
        super(ctx);
        this.size = config.size ?? 900;
        this.overlap = config.overlap ?? 120;
        this.minSize = config.minSize ?? 200;
        if (this.overlap >= this.size) {
            throw new RangeError(`chunker-markdown: overlap ${this.overlap} must be smaller than size ${this.size}`);
        }
        this.chunkerRef = stageDigest(MarkdownChunker.name, {
            size: this.size,
            overlap: this.overlap,
            minSize: this.minSize,
        });
    }
    /** One line a human reads before approving a rebuild. */
    describe() {
        return `markdown headings, ${this.size} chars with ${this.overlap} overlap, merging below ${this.minSize}`;
    }
    /**
     * Split one document at its headings.
     * @param document - the document to split.
     * @returns chunks in document order, each titled with its section heading.
     */
    chunk(document) {
        const merged = [];
        let pending = null;
        for (const section of sections(document.text)) {
            const carried = pending === null
                ? section
                : {
                    heading: pending.heading ?? section.heading,
                    // BOTH headings survive into the text. The merged-into section's
                    // heading loses the title slot to the pending one, and its words
                    // must not vanish with it -- the conformance suite caught exactly
                    // that: a document whose short lead section absorbed "## First
                    // heading" indexed nothing containing the word "First".
                    text: [
                        pending.heading === null ? '' : `${pending.heading}\n`,
                        pending.text,
                        '\n\n',
                        pending.heading !== null && section.heading !== null ? `${section.heading}\n` : '',
                        section.text,
                    ].join('').trim(),
                };
            // A short section on its own retrieves nothing useful, so it is carried
            // forward rather than indexed alone. The last one is kept regardless --
            // dropping a trailing short section would silently lose the end of every
            // document that ends in one.
            if (carried.text.length < this.minSize)
                pending = carried;
            else {
                merged.push(carried);
                pending = null;
            }
        }
        if (pending !== null)
            merged.push(pending);
        const chunks = [];
        for (const section of merged) {
            // Split the BODY, then prepend the heading to each span -- not the other
            // way round. Prepending first and splitting after has two failures, and
            // the first one is silent: a long section can emit a span consisting of
            // the heading alone, which is a chunk with a strong title and no
            // information, and it then attracts every query whose words resemble that
            // heading. The second is that only the first span kept the heading at
            // all, so the rest of a long section lost the very signal this chunker
            // exists to preserve.
            const spans = section.text.length <= this.size
                ? [section.text]
                : splitRecursive(section.text, {
                    size: this.size,
                    overlap: this.overlap,
                    separators: DEFAULT_SEPARATORS,
                });
            for (const span of spans) {
                if (span.trim() === '')
                    continue;
                chunks.push(buildChunk(document, chunks.length, section.heading === null ? span : `${section.heading}\n\n${span}`, { heading: section.heading }, section.heading ?? document.title));
            }
        }
        return chunks;
    }
}
export default MarkdownChunker;
//# sourceMappingURL=index.js.map