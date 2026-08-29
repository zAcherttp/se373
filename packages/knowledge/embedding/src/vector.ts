/**
 * Matryoshka truncation and L2 normalization.
 *
 * These live in the seam owner rather than in a provider because they are part
 * of what `dims` *means*. If each provider truncated its own way, two providers
 * configured to 256 dimensions would disagree about what a 256-dimensional
 * vector is, and the fingerprint — which records `dims` — would claim they
 * agreed.
 *
 * @module @se373/embedding/vector
 */

/**
 * L2-normalize in place.
 *
 * A zero vector is returned untouched rather than divided by zero: it can arise
 * from a degenerate input (an empty string after templating), and turning it
 * into `NaN`s would poison a whole index while producing no error until a query
 * silently matched nothing.
 * @param vector - modified in place.
 * @returns the same array, for chaining.
 */
export function normalizeInPlace(vector: Float32Array): Float32Array {
  let sum = 0
  for (let i = 0; i < vector.length; i += 1) sum += vector[i]! * vector[i]!
  if (sum === 0) return vector
  const inverse = 1 / Math.sqrt(sum)
  for (let i = 0; i < vector.length; i += 1) vector[i]! *= inverse
  return vector
}

/**
 * Take a Matryoshka prefix and renormalize it.
 *
 * MRL guarantees that the first `dims` components of a trained embedding are
 * themselves a usable embedding — but only after renormalizing, because a
 * prefix of a unit vector is not a unit vector. Skipping that step yields
 * vectors whose magnitude encodes how much was discarded, which quietly turns
 * cosine ranking into something else.
 * @param vector - the full-width vector.
 * @param dims - target width; must not exceed the input width.
 * @returns a new array of `dims` components, L2-normalized.
 */
export function truncateToDims(vector: Float32Array, dims: number): Float32Array {
  if (dims > vector.length) {
    throw new RangeError(`cannot truncate a ${vector.length}-dim vector to ${dims} dims`)
  }
  if (dims === vector.length) return normalizeInPlace(vector)
  return normalizeInPlace(vector.slice(0, dims))
}
