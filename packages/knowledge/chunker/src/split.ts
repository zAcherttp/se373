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
  readonly size: number
  /** Characters of trailing context repeated at the start of the next chunk. */
  readonly overlap: number
  /** Separators tried in order, coarsest first. */
  readonly separators: readonly string[]
}

/** The default ladder: paragraph, line, sentence, clause, word. */
export const DEFAULT_SEPARATORS: readonly string[] = ['\n\n', '\n', '. ', ', ', ' ']

/** Length of `parts` once joined. */
function measure(parts: readonly string[], joiner: string): number {
  let total = 0
  for (const [index, part] of parts.entries()) total += part.length + (index > 0 ? joiner.length : 0)
  return total
}

/**
 * Fixed windows, for text with no separator left to try.
 *
 * The escape hatch for a run of characters that cannot be broken sensibly — a
 * base64 blob, a minified line, CJK text with no spaces. Windows rather than
 * one oversized chunk, because a chunk far past the model's token budget is
 * silently truncated at embed time and the tail is never indexed at all.
 */
function hardWindows(text: string, size: number, overlap: number): string[] {
  const step = Math.max(1, size - overlap)
  const out: string[] = []
  for (let start = 0; start < text.length; start += step) out.push(text.slice(start, start + size))
  return out
}

/** Greedily merge pieces up to `size`, repeating a tail of `overlap` characters. */
function merge(pieces: readonly string[], joiner: string, size: number, overlap: number): string[] {
  const chunks: string[] = []
  let current: string[] = []
  for (const piece of pieces) {
    if (current.length > 0 && measure([...current, piece], joiner) > size) {
      chunks.push(current.join(joiner))
      // Keep a tail no longer than `overlap`, dropping from the front. Always
      // drops at least one piece, so a piece that is itself longer than the
      // overlap cannot wedge the loop.
      const tail = [...current]
      do tail.shift()
      while (tail.length > 0 && measure(tail, joiner) > overlap)
      current = tail
    }
    current.push(piece)
  }
  if (current.length > 0) chunks.push(current.join(joiner))
  return chunks
}

/**
 * Split text into chunks of roughly `size` characters.
 * @param text - the text to split.
 * @param options - target size, overlap, and the separator ladder.
 * @returns non-empty, trimmed chunks in document order.
 */
export function splitRecursive(text: string, options: SplitOptions): string[] {
  const { size, overlap, separators } = options
  if (overlap >= size) throw new RangeError(`overlap ${overlap} must be smaller than size ${size}`)

  const walk = (input: string, ladder: readonly string[]): string[] => {
    if (input.length <= size) return [input]
    const [separator, ...rest] = ladder
    if (separator === undefined) return hardWindows(input, size, overlap)
    const pieces = input.split(separator).filter(piece => piece !== '')
    // Nothing to gain from this separator; drop to the next rather than
    // recursing on an identical input, which would not terminate.
    if (pieces.length <= 1) return walk(input, rest)
    const expanded = pieces.flatMap(piece => (piece.length > size ? walk(piece, rest) : [piece]))
    return merge(expanded, separator, size, overlap)
  }

  return walk(text, separators)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk !== '')
}
