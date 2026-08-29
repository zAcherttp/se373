/**
 * What a corpus hands to the rest of the write path.
 *
 * @module @se373/corpus/types
 */

/**
 * One retrievable unit before chunking — a file, a page, a record.
 *
 * `contentHash` is the field that makes incremental re-ingest possible, and it
 * is deliberately over the document's *bytes* rather than over anything the
 * source declares. A source can be wrong about whether a file changed —
 * mtimes lie, caches lie, `git status` lies about a touched-but-identical file
 * — but a hash of what was read cannot be. Re-ingest skips a document when its
 * hash matches what the index already holds, so being wrong here means either
 * re-embedding work that did not need it (slow) or skipping work that did
 * (silently stale), and only the second one is invisible.
 */
export interface Document {
  /**
   * Stable identity within its source.
   *
   * Stability is the whole requirement: chunk keys derive from it, and a
   * document whose id changes between crawls is a document that is *added*
   * rather than updated, leaving the old chunks orphaned in the index. A
   * source-relative path is stable; an absolute path is not, because it moves
   * with the checkout.
   */
  readonly id: string
  /** The full text. */
  readonly text: string
  /** A human-facing title, when the source has one. */
  readonly title: string | null
  /** SHA-256 of {@link text}. */
  readonly contentHash: string
  /** Anything the source wants to survive into a hit. */
  readonly metadata: Record<string, unknown>
}

/** What a crawl found. */
export interface CrawlSummary {
  /** How many documents were yielded. */
  readonly documents: number
  /** Total characters across them. */
  readonly characters: number
}
