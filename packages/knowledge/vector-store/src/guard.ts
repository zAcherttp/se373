/**
 * The refusal that keeps an index meaningful.
 *
 * This is the whole answer to "must the same model embed and query?" — yes, and
 * here is where saying otherwise stops being possible. A query vector from a
 * different model is not slightly worse; it is a point in an unrelated space,
 * and nearest-neighbour search over it returns a confident, plausible,
 * completely arbitrary ranking. Nothing downstream can detect that. So the
 * mismatch is a hard failure at the boundary, never a warning and never a
 * silent re-embed.
 *
 * It lives in the seam owner rather than in a provider because every provider
 * must refuse identically. A store that accepted what another rejected would
 * make the guarantee a property of the deployment rather than of the design.
 *
 * @module @se373/vector-store/guard
 */

import type { EmbedResult } from '@se373/embedding'
import type { Generation } from './types.ts'

/**
 * Refuse vectors that this generation cannot compare against.
 *
 * The width check is redundant with the fingerprint — `dims` is one of its
 * inputs — and is kept because it is the mismatch a human can act on without
 * decoding a hex digest, and because it catches a provider that returns the
 * wrong shape while reporting the right identity.
 * @param generation - the generation being written to or read from.
 * @param embedded - the vectors, carrying the fingerprint that produced them.
 * @param purpose - which side of the boundary this is, for the message.
 * @throws Error naming both fingerprints and the remedy.
 */
export function assertComparable(
  generation: Generation,
  embedded: EmbedResult,
  purpose: 'write' | 'read',
): void {
  if (embedded.fingerprint !== generation.fingerprint) {
    throw new Error(
      `refusing to ${purpose} generation ${generation.id}: it was written by ${generation.modelId} `
      + `(fingerprint ${generation.fingerprint.slice(0, 12)}…) and these vectors came from a model `
      + `fingerprinted ${embedded.fingerprint.slice(0, 12)}…. `
      + 'Vectors from different models are not comparable. Build a new generation with the current '
      + 'embedder, or mount the embedder this generation was written with.',
    )
  }
  if (embedded.dims !== generation.dims) {
    throw new Error(
      `refusing to ${purpose} generation ${generation.id}: it stores ${generation.dims}-dim vectors, `
      + `these are ${embedded.dims}-dim`,
    )
  }
}
