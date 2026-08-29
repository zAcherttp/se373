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

import { Context } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { stageDigest } from '@se373/digest'
import { buildChunk, Chunker, DEFAULT_SEPARATORS, splitRecursive } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'

/** Configuration for the recursive chunker. */
export interface Config {
  /** Target characters per chunk. */
  readonly size?: number
  /** Characters repeated between adjacent chunks. Must be smaller than `size`. */
  readonly overlap?: number
  /** Separators tried in order, coarsest first. */
  readonly separators?: readonly string[]
}

/**
 * Format-agnostic recursive chunker.
 */
export class RecursiveChunker extends Chunker {
  static override readonly name = 'chunker-recursive'

  static readonly Config: Schema<Config> = z.object({
    size: z.natural().default(900),
    overlap: z.natural().default(120),
    separators: z.array(z.string()),
  }) as Schema<Config>

  private readonly size: number
  private readonly overlap: number
  private readonly separators: readonly string[]

  readonly chunkerRef: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.size = config.size ?? 900
    this.overlap = config.overlap ?? 120
    this.separators = config.separators ?? DEFAULT_SEPARATORS
    if (this.overlap >= this.size) {
      throw new RangeError(`chunker-recursive: overlap ${this.overlap} must be smaller than size ${this.size}`)
    }
    this.chunkerRef = stageDigest(RecursiveChunker.name, {
      size: this.size,
      overlap: this.overlap,
      // Order matters here and is NOT sorted: the ladder is tried in sequence,
      // so two orderings are two chunkers.
      separators: this.separators,
    })
  }

  /** One line a human reads before approving a rebuild. */
  describe(): string {
    return `recursive, ${this.size} chars with ${this.overlap} overlap`
  }

  /**
   * Split one document.
   * @param document - the document to split.
   * @returns chunks in document order.
   */
  chunk(document: Document): Chunk[] {
    const spans = splitRecursive(document.text, {
      size: this.size,
      overlap: this.overlap,
      separators: this.separators,
    })
    return spans.map((text, index) => buildChunk(document, index, text))
  }
}

export default RecursiveChunker
