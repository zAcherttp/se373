/**
 * The generation key is the plane's only defence against answering from an
 * index a different pipeline wrote, and the cascade is what keeps rebuilding it
 * affordable. Both fail silently in opposite directions:
 *
 * - **A stage the key stops covering** means the index never looks stale, so
 *   retrieval never fails closed and the answers come from vectors nothing
 *   configured now would have produced.
 * - **A cascade that under-reports** means a source change is treated as an
 *   embedder change, the corpus is never re-crawled, and the index quietly
 *   describes a version of the documents that no longer exists. The opposite
 *   error — over-reporting — is merely expensive, and visible.
 *
 * The coverage check runs in both directions, as it does for the embedder
 * identity: every stage must change the key, and every stage must have a case.
 */

import { describe, expect, it } from 'vitest'
import { describePlan, firstDivergence, generationKey, rebuildPlan } from '../src/staleness.ts'
import { WRITE_PATH_STAGES } from '../src/types.ts'
import type { StageRefs } from '../src/types.ts'

const BASE: StageRefs = { source: 's1', chunker: 'c1', embedder: 'e1', store: 'v1' }

describe('generationKey', () => {
  it('changes when any stage changes', () => {
    const base = generationKey(BASE)
    for (const stage of WRITE_PATH_STAGES) {
      expect(generationKey({ ...BASE, [stage]: 'changed' }), `${stage} did not affect the key`).not.toBe(base)
    }
  })

  it('covers exactly the declared write-path stages', () => {
    // If a fifth stage is added to WRITE_PATH_STAGES and not to the key, the
    // loop above still passes -- it only iterates what the key already reads.
    // This is the direction that catches that.
    const extended = generationKey({ ...BASE, extra: 'x' } as unknown as StageRefs)
    expect(extended).toBe(generationKey(BASE))
    expect(WRITE_PATH_STAGES).toEqual(['source', 'chunker', 'embedder', 'store'])
  })

  it('does not depend on key order', () => {
    const reordered = { store: 'v1', embedder: 'e1', chunker: 'c1', source: 's1' } satisfies StageRefs
    expect(generationKey(reordered)).toBe(generationKey(BASE))
  })
})

describe('firstDivergence', () => {
  it('reports the earliest stage, not the last', () => {
    // Both changed. Reporting `store` would plan a rewrite and skip the
    // re-crawl the source change actually requires.
    const live = { ...BASE, source: 's2', store: 'v2' }
    expect(firstDivergence(BASE, live)).toBe('source')
  })

  it('walks in cascade order rather than in object order', () => {
    const live: StageRefs = { store: 'v2', embedder: 'e2', chunker: 'c1', source: 's1' }
    expect(firstDivergence(BASE, live)).toBe('embedder')
  })

  it('returns null for identical configurations', () => {
    expect(firstDivergence(BASE, { ...BASE })).toBeNull()
  })
})

describe('rebuildPlan', () => {
  it('matches the cascade table in §5.5', () => {
    expect(rebuildPlan('source')).toEqual({
      from: 'source', recrawl: true, rechunk: true, reembed: true, rewrite: true,
    })
    expect(rebuildPlan('chunker')).toEqual({
      from: 'chunker', recrawl: false, rechunk: true, reembed: true, rewrite: true,
    })
    expect(rebuildPlan('embedder')).toEqual({
      from: 'embedder', recrawl: false, rechunk: false, reembed: true, rewrite: true,
    })
    expect(rebuildPlan('store')).toEqual({
      from: 'store', recrawl: false, rechunk: false, reembed: false, rewrite: true,
    })
  })

  it('is monotonic: an earlier stage never asks for less work', () => {
    // The property the table encodes. Written separately so that reordering
    // WRITE_PATH_STAGES breaks something loudly.
    const plans = WRITE_PATH_STAGES.map(stage => rebuildPlan(stage))
    for (let i = 1; i < plans.length; i += 1) {
      const earlier = plans[i - 1]!
      const later = plans[i]!
      for (const step of ['recrawl', 'rechunk', 'reembed', 'rewrite'] as const) {
        if (later[step]) expect(earlier[step], `${step} at ${earlier.from} vs ${later.from}`).toBe(true)
      }
    }
  })

  it('names the changed stage and the steps in its description', () => {
    expect(describePlan(rebuildPlan('embedder'))).toBe('embedder changed: re-embed, rewrite the store')
  })
})
