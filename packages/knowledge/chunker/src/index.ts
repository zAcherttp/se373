/**
 * `ctx.chunker` — how a document becomes indexable spans.
 *
 * A **seam**: one at a time, swapped by config row. Stage 1 of the write path,
 * so a change here re-chunks, re-embeds and rewrites, but does **not** re-crawl
 * (§5.5's positional cascade).
 *
 * Synchronous on purpose. Chunking is pure text manipulation over a document
 * that is already in memory; an async signature would invite a provider that
 * calls a model to decide boundaries, which would put a network dependency in
 * front of the *cheap* stage and make the cascade's cost model wrong.
 *
 * @module @se373/chunker
 */

import { Context, Service } from '@se373/cordis'
import type { Document } from '@se373/corpus'
import type { Chunk } from './types.ts'

export * from './types.ts'
export * from './split.ts'

declare module '@se373/cordis' {
  interface Context {
    chunker: Chunker
  }
}

/**
 * Abstract chunker.
 */
export abstract class Chunker extends Service {
  constructor(ctx: Context) {
    super(ctx, 'chunker')
  }

  /** Digest of this provider and its resolved configuration. Stage 1 of the generation key. */
  abstract readonly chunkerRef: string

  /** One line a human reads before approving a rebuild. */
  abstract describe(): string

  /**
   * Split one document.
   * @param document - the document to split.
   * @returns chunks in document order; may be empty for an empty document.
   */
  abstract chunk(document: Document): Chunk[]
}

/**
 * Build a chunk from a document and one span of its text.
 *
 * Shared so that every provider derives keys and carries the document hash the
 * same way. A provider that invented its own key scheme would still work until
 * the day somebody swapped providers on an existing index, at which point every
 * chunk would be an insert rather than an update and the old ones would linger.
 * @param document - the source document.
 * @param index - the chunk's position, from zero.
 * @param text - the chunk's text.
 * @param extra - provider-specific metadata, merged over the document's.
 * @param title - overrides the document's title, e.g. with a section heading.
 * @returns the chunk.
 */
export function buildChunk(
  document: Document,
  index: number,
  text: string,
  extra: Record<string, unknown> = {},
  title: string | null = document.title,
): Chunk {
  return {
    key: `${document.id}#${index}`,
    documentId: document.id,
    index,
    text,
    title,
    documentHash: document.contentHash,
    metadata: { ...document.metadata, ...extra },
  }
}

export default Chunker
