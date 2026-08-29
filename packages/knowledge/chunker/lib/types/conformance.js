/**
 * What any chunker must satisfy before an index is built on it.
 *
 * This is the suite an *authored* chunker passes to earn a mount (I7), so its
 * checks are chosen against what a plausible model-written implementation gets
 * silently wrong — not against what our own providers happen to do:
 *
 * - **Coverage.** Losing text is the worst chunker bug: counts look right,
 *   retrieval works, and passages that would have answered some future
 *   question were never stored. Checked over fixtures that force the awkward
 *   paths — a separator-free run, a document that is all structure.
 * - **Determinism.** Incremental ingest compares a document's chunks to what
 *   the index holds; a chunker with any randomness re-writes every document on
 *   every ingest, which reads as "everything changed" and costs a full
 *   re-embed, forever.
 * - **The key scheme.** Keys must be `<documentId>#<index>`, dense from zero,
 *   because the store upserts by key: an authored chunker with its own scheme
 *   works perfectly until it replaces one built on the shared scheme, at which
 *   point every chunk is an insert and the replaced ones linger.
 * - **Hash carriage.** Every chunk carries its document's content hash, or
 *   incremental ingest sees a document that always looks new.
 *
 * @module @se373/chunker/conformance
 */
import { contentDigest } from '@se373/digest';
/** A fixture document from raw text. */
function document(id, text) {
    return { id, text, title: null, contentHash: contentDigest(text), metadata: {} };
}
/** Fixtures chosen to force the paths where text goes missing. */
const FIXTURES = [
    document('prose.md', Array.from({ length: 30 }, (_, i) => `Sentence ${i} of an ordinary paragraph, with enough words to matter.`).join(' ')),
    document('structured.md', [
        '# Title', '', '## First heading', '', 'Body under the first heading, sized to stand alone. '.repeat(8),
        '', '## Second heading', '', 'Body under the second heading, also sized to stand alone. '.repeat(8),
    ].join('\n')),
    document('unbroken.md', `prefix ${'x'.repeat(2500)} suffix`),
    document('short.md', 'One line only.'),
];
/** Every run of non-whitespace characters, as a set. */
function tokens(text) {
    return new Set(text.split(/\s+/).filter(token => token !== ''));
}
/**
 * Run the suite against a live chunker.
 * @param chunker - the provider to check.
 * @throws Error naming the first violated rule and the fixture that showed it.
 */
export function assertChunkerConformance(chunker) {
    if (typeof chunker.chunkerRef !== 'string' || chunker.chunkerRef === '') {
        throw new Error('chunkerRef is empty; the generation key cannot see this chunker change');
    }
    for (const fixture of FIXTURES) {
        const first = chunker.chunk(fixture);
        const again = chunker.chunk(fixture);
        if (first.length !== again.length
            || first.some((chunk, index) => chunk.text !== again[index].text || chunk.key !== again[index].key)) {
            throw new Error(`${fixture.id}: two runs over identical input differ; a nondeterministic chunker re-embeds every document on every ingest`);
        }
        for (const [index, chunk] of first.entries()) {
            if (chunk.key !== `${fixture.id}#${index}`) {
                throw new Error(`${fixture.id}: chunk ${index} has key ${JSON.stringify(chunk.key)}, expected `
                    + `"${fixture.id}#${index}" — the store upserts by this scheme, and a private scheme orphans every replaced chunk`);
            }
            if (chunk.documentHash !== fixture.contentHash) {
                throw new Error(`${fixture.id}: chunk ${index} does not carry the document's content hash; incremental ingest would see a document that always looks new`);
            }
            if (chunk.text.trim() === '') {
                throw new Error(`${fixture.id}: chunk ${index} is empty; an empty chunk embeds a zero-signal vector`);
            }
        }
        // Coverage over word identity rather than exact concatenation, because
        // overlap legitimately duplicates and trimming legitimately reshapes -- but
        // a WORD present in the input and absent from every chunk is text lost.
        //
        // Tokens longer than a chunk can legitimately be windowed apart, so they
        // are checked by character count instead: windowing duplicates characters
        // and never drops them, and a chunker that truncated a giant run shows up
        // as fewer of its characters emitted than were given.
        const joined = first.map(chunk => chunk.text).join(' ');
        const emitted = tokens(joined);
        const counts = new Map();
        for (const char of joined)
            counts.set(char, (counts.get(char) ?? 0) + 1);
        for (const token of tokens(fixture.text)) {
            // Structural markers may be consumed by structure-aware chunkers.
            if (/^#+$/.test(token))
                continue;
            if (token.length > 48) {
                const need = new Map();
                for (const char of token)
                    need.set(char, (need.get(char) ?? 0) + 1);
                for (const [char, count] of need) {
                    if ((counts.get(char) ?? 0) < count) {
                        throw new Error(`${fixture.id}: an unbroken ${token.length}-char run lost characters; text was lost`);
                    }
                }
                continue;
            }
            if (!emitted.has(token)) {
                throw new Error(`${fixture.id}: ${JSON.stringify(token)} appears in the document and in no chunk; text was lost`);
            }
        }
    }
}
//# sourceMappingURL=conformance.js.map