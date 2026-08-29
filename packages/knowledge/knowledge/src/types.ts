/**
 * The vocabulary of the composed knowledge plane.
 *
 * @module @se373/knowledge/types
 */

import type { Hit } from '@se373/vector-store'

/**
 * The write-path stages, **in cascade order**.
 *
 * The order is the specification, not a presentation choice: §5.5's rule is
 * that a change at stage N invalidates N…end and nothing before it, so this
 * array is what makes "which stage changed" answerable and "how much must be
 * redone" derivable rather than declared.
 */
export const WRITE_PATH_STAGES = ['source', 'chunker', 'embedder', 'store'] as const

/** One stage of the write path. */
export type WritePathStage = (typeof WRITE_PATH_STAGES)[number]

/** A digest per write-path stage. Together they are the generation key. */
export type StageRefs = Readonly<Record<WritePathStage, string>>

/** What a change at a given stage forces. */
export interface RebuildPlan {
  /** The earliest stage that differs. */
  readonly from: WritePathStage
  /** Read the corpus again. */
  readonly recrawl: boolean
  /** Split documents again. */
  readonly rechunk: boolean
  /** Embed chunks again. */
  readonly reembed: boolean
  /** Write a new generation. */
  readonly rewrite: boolean
}

/** How an index compares to the pipeline currently configured. */
export interface IndexStatus {
  /** The key the live configuration would write under. */
  readonly genKey: string
  /** Per-stage digests of the live configuration. */
  readonly stages: StageRefs
  /** The generation queries currently go to, if any. */
  readonly generationId: string | null
  /** How many chunks it holds. */
  readonly records: number
  /** The key the active generation was written under. */
  readonly activeGenKey: string | null
  /**
   * `null` when the active generation matches the live configuration.
   *
   * Otherwise the first stage that differs and what rebuilding costs — which
   * is what §5.5 requires a plan card to state before a destructive change is
   * approved.
   */
  readonly stale: RebuildPlan | null
  /** One line per stage, for a human deciding whether to approve a rebuild. */
  readonly describe: Readonly<Record<string, string>>
}

/** A retrieval request, as the `knowledge/pre-retrieve` waterfall sees it. */
export interface Query {
  /** The text to embed. Listeners may rewrite it. */
  readonly text: string
  /** How many hits to return. */
  readonly k: number
  /**
   * How many candidates to pull per requested hit.
   *
   * Over-fetching is what gives the post-retrieve waterfall material to work
   * with: dedup and diversity cannot remove anything from a list that is
   * already exactly `k` long without returning fewer answers than were asked
   * for.
   */
  readonly overfetch: number
  /** Anything a listener wants to carry — tenant, ACL, locale. */
  readonly metadata: Record<string, unknown>
}

/** Options for one retrieval. */
export interface RetrieveOptions {
  /** How many hits to return. */
  readonly k?: number
  /** Candidates per requested hit. */
  readonly overfetch?: number
  /** Carried into the waterfalls untouched. */
  readonly metadata?: Record<string, unknown>
}

/** Options for one ingest. */
export interface IngestOptions {
  /**
   * Re-read and re-embed every document, even unchanged ones.
   *
   * The escape hatch for the case content hashing cannot see: a bug in the
   * chunker that produced wrong chunks from unchanged input.
   */
  readonly force?: boolean
  /** Flip to the new generation when it completes. Defaults to true. */
  readonly activate?: boolean
  /** Abort the crawl. */
  readonly signal?: AbortSignal
}

/** How an ingest reached its generation. */
export type IngestMode =
  /** No usable generation existed; everything was crawled, chunked and embedded. */
  | 'create'
  /** An existing generation matched the key; only changed documents were touched. */
  | 'incremental'
  /** Chunks were read back from the previous generation and re-embedded. */
  | 're-embed'

/** What an ingest did. */
export interface IngestReport {
  /** Stable id, carried by every event of this ingest. */
  readonly ingestId: string
  /** The generation written. */
  readonly generationId: string
  /** The key it was written under. */
  readonly genKey: string
  /** Which path was taken. */
  readonly mode: IngestMode
  /** Documents seen, of which changed and skipped. */
  readonly documents: { readonly seen: number, readonly changed: number, readonly skipped: number }
  /** Chunks written and swept. */
  readonly chunks: { readonly written: number, readonly removed: number }
  /** Wall-clock milliseconds. */
  readonly durationMs: number
  /** Terminal status. */
  readonly status: 'ok' | 'failed'
  /** Present when `status` is `failed`. */
  readonly error?: string
}

/** `ingest/start`. */
export interface IngestStart {
  readonly ingestId: string
  readonly genKey: string
  readonly generationId: string
  readonly mode: IngestMode
  /** One line describing each configured stage. */
  readonly stages: Readonly<Record<string, string>>
  readonly startedAt: number
}

/** `ingest/progress`. */
export interface IngestProgress {
  readonly ingestId: string
  readonly documents: number
  readonly changed: number
  readonly chunks: number
  /** The document just handled, for a live log. */
  readonly current: string
}

/** `ingest/end`. */
export interface IngestEnd extends IngestReport {
  readonly endedAt: number
}

/**
 * A hit with the fields the pipeline wrote into its metadata pulled back out.
 *
 * Every consumer wants the heading and the document id, and every consumer
 * reaching into `metadata` for them would be four copies of one convention —
 * which is how a metadata key gets renamed in three places out of four.
 */
export interface RetrievedChunk extends Hit {
  /** The section heading or document title this passage sits under. */
  readonly title: string | null
  /** The document it came from. */
  readonly documentId: string
  /** Its position within that document. */
  readonly chunkIndex: number
}

export type { Hit }
