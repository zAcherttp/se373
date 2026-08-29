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
import type { Chunker } from './index.ts';
/**
 * Run the suite against a live chunker.
 * @param chunker - the provider to check.
 * @throws Error naming the first violated rule and the fixture that showed it.
 */
export declare function assertChunkerConformance(chunker: Chunker): void;
//# sourceMappingURL=conformance.d.ts.map