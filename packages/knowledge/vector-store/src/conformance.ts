/**
 * What any vector store must satisfy before an index lives in it.
 *
 * Written for authored providers (I7), so the checks target the mistakes a
 * plausible implementation makes while looking correct:
 *
 * - **The round trip**: what goes in comes back — keys, text, metadata — and
 *   nearest-first means nearest first.
 * - **Upsert replaces.** The store contract is keyed replacement; a provider
 *   that appends returns the same key twice and quietly shrinks every result
 *   set (the join dedups nothing).
 * - **The refusal.** `assertComparable` is exported precisely so every provider
 *   refuses identically; a store that accepts a foreign fingerprint answers
 *   from an unrelated vector space with full confidence.
 * - **Scan and remove**, because the positional cascade reads chunks back out
 *   of a generation and sweeps orphans; a store without a faithful scan turns
 *   every re-embed into a full rebuild silently.
 *
 * @module @se373/vector-store/conformance
 */

import type { EmbedderIdentity, EmbedResult } from '@se373/embedding'
import type { VectorStore } from './index.ts'

/** A fixed four-dimensional identity for the suite. */
const IDENTITY: EmbedderIdentity = {
  modelId: 'conformance-fixture',
  repo: 'se373/conformance',
  revision: '0'.repeat(40),
  artifacts: [{ file: 'model.onnx', sha256: 'a'.repeat(64), bytes: 1 }],
  nativeDims: 4,
  dims: 4,
  maxTokens: 16,
  templates: { document: 'd: {content}', query: 'q: {content}' },
  normalize: false,
  fingerprint: 'f'.repeat(64),
}

/** A batch under the fixture identity. */
function embedded(...vectors: number[][]): EmbedResult {
  return { fingerprint: IDENTITY.fingerprint, dims: 4, vectors: vectors.map(v => new Float32Array(v)) }
}

/**
 * Run the suite against a live store.
 *
 * Everything happens in generations the suite creates and drops, so it may run
 * against a store that already holds real data.
 * @param store - the provider to check.
 * @throws Error naming the first violated rule.
 */
export async function assertVectorStoreConformance(store: VectorStore): Promise<void> {
  if (typeof store.schemaRef !== 'string' || store.schemaRef === '') {
    throw new Error('schemaRef is empty; the generation key cannot see this store change')
  }
  const generation = await store.create(IDENTITY, { suite: 'conformance' })
  try {
    if (generation.fingerprint !== IDENTITY.fingerprint) {
      throw new Error('a generation must record the identity it was created with')
    }

    await store.upsert(generation.id, [
      { key: 'a', text: 'alpha', metadata: { n: 1 } },
      { key: 'b', text: 'beta' },
      { key: 'c', text: 'gamma' },
    ], embedded([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]))

    const hits = await store.query(generation.id, embedded([0.9, 0.1, 0, 0]), 2)
    if (hits.length !== 2) throw new Error(`asked for 2 hits and got ${hits.length}`)
    if (hits[0]!.key !== 'a') {
      throw new Error(`nearest-first is violated: expected "a" first, got ${JSON.stringify(hits[0]!.key)}`)
    }
    if (hits[0]!.text !== 'alpha' || (hits[0]!.metadata as { n?: number } | null)?.n !== 1) {
      throw new Error('text and metadata must round-trip on a hit')
    }

    // Upsert replaces: same key, new vector. The old vector answering, or the
    // key answering twice, are both the append bug.
    await store.upsert(generation.id, [{ key: 'a', text: 'alpha-2' }], embedded([0, 0, 0, 1]))
    const replaced = await store.query(generation.id, embedded([0, 0, 0, 1]), 5)
    const aHits = replaced.filter(hit => hit.key === 'a')
    if (aHits.length !== 1) throw new Error(`key "a" appears ${aHits.length} times after upsert; upsert must replace`)
    if (aHits[0]!.text !== 'alpha-2') throw new Error('upsert must replace the stored text')

    const scanned: string[] = []
    for await (const record of store.scan(generation.id)) scanned.push(record.key)
    if ([...scanned].sort().join(',') !== 'a,b,c') {
      throw new Error(`scan returned [${scanned.join(', ')}], expected the three stored keys; the cascade reads chunks back through this`)
    }

    const removed = await store.remove(generation.id, ['b', 'never-existed'])
    if (removed !== 1) throw new Error(`remove reported ${removed}, expected 1 (unknown keys are ignored, not errors)`)
    const afterRemove = await store.query(generation.id, embedded([0, 1, 0, 0]), 5)
    if (afterRemove.some(hit => hit.key === 'b')) throw new Error('a removed key still answers queries')

    const foreign: EmbedResult = { fingerprint: '0'.repeat(64), dims: 4, vectors: [new Float32Array([1, 0, 0, 0])] }
    const refused = await store.query(generation.id, foreign, 1).then(() => false, () => true)
    if (!refused) {
      throw new Error('the store answered vectors from a different fingerprint; it must refuse (assertComparable exists to be called)')
    }
  } finally {
    await store.drop(generation.id)
  }
  if ((await store.list()).some(entry => entry.id === generation.id)) {
    throw new Error('a dropped generation is still listed; disposal must release it')
  }
}
