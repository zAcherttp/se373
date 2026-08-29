/**
 * Mean-pooling that counts padded positions is a silent corruption: every
 * vector shifts toward whatever the pad token encodes, by an amount that
 * depends on how uneven the batch was. Nothing errors, no shape changes, and
 * the same text embedded alone and embedded next to a long neighbour produces
 * different vectors -- which makes an index quietly depend on batch packing.
 *
 * `chooseOutput` is here for the neighbouring failure: preferring the wrong
 * output would mean pooling an already-pooled tensor, or returning raw token
 * vectors as if they were sentence vectors.
 */

import { describe, expect, it } from 'vitest'
import { chooseOutput, meanPool } from '../src/session.ts'

/** `[batch, sequence, width]` token vectors, laid out flat. */
function hidden(rows: number[][][]): Float32Array {
  return new Float32Array(rows.flat(2))
}

describe('meanPool', () => {
  it('ignores padded positions', () => {
    // Two real tokens then one pad carrying a huge value. Including it would
    // dominate the mean; excluding it gives exactly the average of the first two.
    const data = hidden([[[1, 2], [3, 4], [1000, 1000]]])
    const [pooled] = meanPool(data, [1, 3, 2], [[1, 1, 0]])
    expect([...pooled!]).toEqual([2, 3])
  })

  it('pools each sequence against its own mask', () => {
    const data = hidden([
      [[2, 0], [4, 0], [999, 999]],
      [[1, 1], [3, 3], [5, 5]],
    ])
    const pooled = meanPool(data, [2, 3, 2], [[1, 1, 0], [1, 1, 1]])
    expect([...pooled[0]!]).toEqual([3, 0])
    expect([...pooled[1]!]).toEqual([3, 3])
  })

  it('gives one text the same vector regardless of its neighbour', () => {
    // The property that actually matters: an index must not depend on how the
    // corpus happened to be batched.
    const alone = meanPool(hidden([[[1, 2], [3, 4]]]), [1, 2, 2], [[1, 1]])
    const padded = meanPool(
      hidden([[[1, 2], [3, 4], [7, 7], [9, 9]]]),
      [1, 4, 2],
      [[1, 1, 0, 0]],
    )
    expect([...padded[0]!]).toEqual([...alone[0]!])
  })

  it('returns zeros rather than NaNs for an all-padding sequence', () => {
    const [pooled] = meanPool(hidden([[[5, 5]]]), [1, 1, 2], [[0]])
    expect([...pooled!]).toEqual([0, 0])
  })
})

describe('chooseOutput', () => {
  const session = (...outputNames: string[]) => ({ outputNames }) as never

  it('prefers the graph\'s own pooled output over token vectors', () => {
    expect(chooseOutput(session('last_hidden_state', 'sentence_embedding')))
      .toEqual({ name: 'sentence_embedding', pooled: true })
  })

  it('falls back to token vectors and marks them unpooled', () => {
    expect(chooseOutput(session('last_hidden_state')))
      .toEqual({ name: 'last_hidden_state', pooled: false })
  })

  it('refuses a graph with neither, naming what it has', () => {
    expect(() => chooseOutput(session('logits'))).toThrow(/logits/)
  })
})
