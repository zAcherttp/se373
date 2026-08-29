/**
 * Matryoshka truncation without a renormalize is the archetypal silent
 * embedding bug: the vectors are the right width, they contain no NaNs, every
 * shape check passes, and cosine ranking quietly becomes a function of how much
 * of each vector was discarded rather than of what the text means.
 *
 * Deleting the renormalize is a one-line "optimization" that nothing else in
 * this repository would notice.
 */

import { describe, expect, it } from 'vitest'
import { normalizeInPlace, truncateToDims } from '../src/vector.ts'

/** Euclidean length. */
function magnitude(vector: Float32Array): number {
  let sum = 0
  for (const value of vector) sum += value * value
  return Math.sqrt(sum)
}

/** A unit vector whose energy is spread unevenly across its components. */
function unitVector(width: number): Float32Array {
  const vector = new Float32Array(width)
  for (let i = 0; i < width; i += 1) vector[i] = 1 / (i + 1)
  return normalizeInPlace(vector)
}

describe('truncateToDims', () => {
  it('returns a unit vector, not a bare prefix', () => {
    const full = unitVector(8)
    // The prefix of a unit vector is shorter than 1 whenever anything was
    // discarded -- that is exactly the tail this vector puts energy in.
    expect(magnitude(full.slice(0, 4))).toBeLessThan(0.999)
    expect(magnitude(truncateToDims(full, 4))).toBeCloseTo(1, 5)
  })

  it('keeps the prefix direction while rescaling it', () => {
    const full = unitVector(8)
    const truncated = truncateToDims(full, 4)
    // Same ray, different length: component ratios survive, magnitudes do not.
    const ratio = truncated[0]! / full[0]!
    for (let i = 1; i < 4; i += 1) expect(truncated[i]! / full[i]!).toBeCloseTo(ratio, 5)
    expect(ratio).toBeGreaterThan(1)
  })

  it('still normalizes at full width', () => {
    const scaled = new Float32Array([3, 4, 0, 0])
    expect(magnitude(truncateToDims(scaled, 4))).toBeCloseTo(1, 5)
  })

  it('refuses to widen', () => {
    expect(() => truncateToDims(new Float32Array(4), 8)).toThrow(RangeError)
  })
})

describe('normalizeInPlace', () => {
  it('leaves a zero vector alone rather than filling it with NaN', () => {
    // A degenerate input -- an empty string after templating -- would otherwise
    // divide by zero. NaNs survive every later comparison as NaNs, so one such
    // chunk silently removes itself from every ranking in the index.
    const zero = normalizeInPlace(new Float32Array(4))
    expect([...zero]).toEqual([0, 0, 0, 0])
  })
})
