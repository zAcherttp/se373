/**
 * The suites run against the shipped providers.
 *
 * Two failure modes, one per direction. A suite too strict rejects every
 * conforming implementation — an authored fork then cannot pass no matter how
 * correct, and I7's rail becomes a wall. A shipped provider that drifts from
 * the contract makes the suite's promise a lie: the fork is held to rules the
 * default silently breaks.
 *
 * So the suites' own test is: the shipped providers pass, and a deliberately
 * broken implementation of each contract fails on the rule it breaks.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { Chunker, buildChunk } from '@se373/chunker'
import { assertChunkerConformance } from '@se373/chunker/conformance'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
import { MarkdownChunker } from '@se373/chunker-markdown'
import { RecursiveChunker } from '@se373/chunker-recursive'
import { PassthroughReranker } from '@se373/rerank-none'
import { Reranker } from '@se373/rerank'
import { assertRerankerConformance } from '@se373/rerank/conformance'
import type { Hit } from '@se373/vector-store'
import { SqliteVecStore } from '@se373/vs-sqlite-vec'
import { assertVectorStoreConformance } from '@se373/vector-store/conformance'

const root = mkdtempSync(join(tmpdir(), 'se373-conformance-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('shipped providers conform', () => {
  it('chunker-markdown', () => {
    assertChunkerConformance(new MarkdownChunker(new Context() as never, {}))
  })
  it('chunker-recursive', () => {
    assertChunkerConformance(new RecursiveChunker(new Context() as never, {}))
  })
  it('vs-sqlite-vec', async () => {
    await assertVectorStoreConformance(new SqliteVecStore(new Context() as never, { dir: join(root, 'store') }))
  })
  it('rerank-none', async () => {
    await assertRerankerConformance(new PassthroughReranker(new Context() as never))
  })
})

describe('broken implementations fail on the rule they break', () => {
  it('a chunker that drops text', () => {
    class Lossy extends Chunker {
      readonly chunkerRef = 'lossy-v1'
      describe(): string { return 'lossy' }
      chunk(document: Document): Chunk[] {
        return [buildChunk(document, 0, document.text.slice(0, Math.floor(document.text.length / 2)))]
      }
    }
    expect(() => assertChunkerConformance(new Lossy(new Context() as never))).toThrow(/text was lost/)
  })

  it('a chunker with a private key scheme', () => {
    class PrivateKeys extends Chunker {
      readonly chunkerRef = 'private-v1'
      describe(): string { return 'private keys' }
      chunk(document: Document): Chunk[] {
        return [{ ...buildChunk(document, 0, document.text), key: `${document.id}::0` }]
      }
    }
    expect(() => assertChunkerConformance(new PrivateKeys(new Context() as never))).toThrow(/scheme/)
  })

  it('a nondeterministic chunker', () => {
    class Jitter extends Chunker {
      readonly chunkerRef = 'jitter-v1'
      private flip = false
      describe(): string { return 'jitter' }
      chunk(document: Document): Chunk[] {
        this.flip = !this.flip
        return [buildChunk(document, 0, this.flip ? document.text : `${document.text} `.trim() + ' extra')]
      }
    }
    expect(() => assertChunkerConformance(new Jitter(new Context() as never))).toThrow(/two runs/)
  })

  it('a store that forgets the refusal', async () => {
    // Forges the query's fingerprint to whatever the generation recorded, so
    // foreign vectors are always "comparable". Every other check passes -- the
    // round trip, upsert, scan -- and the one property the whole plane rests on
    // is gone. The suite's refusal check is the only thing that notices.
    class Trusting extends SqliteVecStore {
      override async query(id: string, embedded: Parameters<SqliteVecStore['query']>[1], k: number) {
        const generation = (await this.list()).find(entry => entry.id === id)!
        return super.query(id, { ...embedded, fingerprint: generation.fingerprint }, k)
      }
    }
    await expect(assertVectorStoreConformance(new Trusting(new Context() as never, { dir: join(root, 'trusting') })))
      .rejects.toThrow(/must refuse/)
  })

  it('a reranker that invents a hit', async () => {
    class Inventor extends Reranker {
      readonly rerankerRef = 'inventor-v1'
      describe(): string { return 'inventor' }
      async rerank<T extends Hit>(_q: string, hits: readonly T[], k: number): Promise<T[]> {
        return [{ key: 'invented#0', distance: 0, text: 'made up', metadata: null } as unknown as T, ...hits].slice(0, k)
      }
    }
    await expect(assertRerankerConformance(new Inventor(new Context() as never))).rejects.toThrow(/invents/)
  })
})
