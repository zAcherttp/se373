/**
 * Capping hits per document is a filter, and a filter that reorders is a
 * ranking bug wearing a filter's clothes: the candidates arrive sorted by
 * distance, and anything that regroups them by document silently promotes a
 * worse passage over a better one. Nothing errors; the answers just get worse.
 */

import { describe, expect, it } from 'vitest'
import { capPerDocument } from '../src/index.ts'
import type { RetrievedChunk } from '@se373/knowledge'

/** A hit from a document, at a distance. */
function hit(documentId: string, key: string, distance: number): RetrievedChunk {
  return { key, distance, text: key, metadata: null, title: null, documentId, chunkIndex: 0 }
}

describe('capPerDocument', () => {
  it('keeps each document\'s best passage, not its first-seen one', () => {
    const hits = [hit('a', 'a#1', 0.1), hit('b', 'b#1', 0.2), hit('a', 'a#0', 0.3)]
    expect(capPerDocument(hits, 1).map(h => h.key)).toEqual(['a#1', 'b#1'])
  })

  it('preserves the incoming ranking', () => {
    // Grouping by document before taking N would produce ['a#1','a#0','b#1'],
    // which reorders the result set.
    const hits = [hit('a', 'a#1', 0.1), hit('b', 'b#1', 0.2), hit('a', 'a#0', 0.3), hit('c', 'c#0', 0.4)]
    const kept = capPerDocument(hits, 2)
    expect(kept.map(h => h.key)).toEqual(['a#1', 'b#1', 'a#0', 'c#0'])
    expect(kept.map(h => h.distance)).toEqual([...kept.map(h => h.distance)].sort((x, y) => x - y))
  })

  it('honours a cap above one', () => {
    const hits = [hit('a', 'a#0', 0.1), hit('a', 'a#1', 0.2), hit('a', 'a#2', 0.3)]
    expect(capPerDocument(hits, 2).map(h => h.key)).toEqual(['a#0', 'a#1'])
  })

  it('does not collapse hits that carry no document id', () => {
    // Chunks written before the metadata contract, or by something that did not
    // follow it. Treating '' as one document would discard all but one of them.
    const hits = [hit('', 'x', 0.1), hit('', 'y', 0.2), hit('a', 'a#0', 0.3)]
    expect(capPerDocument(hits, 1).map(h => h.key)).toEqual(['x', 'y', 'a#0'])
  })
})
