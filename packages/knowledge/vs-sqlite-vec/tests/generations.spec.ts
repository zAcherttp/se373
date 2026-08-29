/**
 * Everything here is a failure that produces plausible results rather than an
 * error.
 *
 * - **The refusal not being wired.** `assertComparable` is a pure function that
 *   reads as obviously correct; what can silently go missing is the *call*. A
 *   store that dropped it on the read path would answer every query, ranking by
 *   the geometry of an unrelated space.
 * - **Upsert appending instead of replacing.** `vec0` has no upsert, so
 *   replacing a key is delete-then-insert. Lose the delete and one key owns two
 *   vectors; the join then returns it twice, `k` hits become `k` rows covering
 *   fewer documents, and recall drops with nothing to point at.
 * - **A flip that half-happens.** Activate has to move both the manifest and the
 *   previous generation's status, or a rollback target reads as current.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { sealIdentity } from '@se373/embedding'
import type { EmbedderIdentity, EmbedResult } from '@se373/embedding'
import { SqliteVecStore } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-vec-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

/** An identity that differs from the base only in the named field. */
function identity(overrides: Partial<EmbedderIdentity> = {}): EmbedderIdentity {
  return sealIdentity({
    modelId: 'fixture',
    repo: 'acme/encoder',
    revision: '0'.repeat(40),
    artifacts: [{ file: 'onnx/model.onnx', sha256: 'a'.repeat(64), bytes: 10 }],
    nativeDims: 4,
    dims: 4,
    maxTokens: 128,
    templates: { document: 'd: {content}', query: 'q: {content}' },
    normalize: true,
    ...overrides,
  }) as EmbedderIdentity
}

/** A batch tagged with an identity's fingerprint. */
function embedded(id: EmbedderIdentity, ...vectors: number[][]): EmbedResult {
  return {
    fingerprint: id.fingerprint,
    dims: id.dims,
    vectors: vectors.map(values => new Float32Array(values)),
  }
}

let store: SqliteVecStore
let dir: string
let counter = 0

beforeEach(() => {
  dir = join(root, `case-${counter += 1}`)
  // A bare root context is enough: the store injects nothing.
  store = new SqliteVecStore(new Context() as never, { dir })
})

describe('fingerprint refusal', () => {
  it('refuses to read a generation with another model\'s vectors', async () => {
    const mine = identity()
    const generation = await store.create(mine)
    await store.upsert(generation.id, [{ key: 'a' }], embedded(mine, [1, 0, 0, 0]))

    const theirs = identity({ revision: '1'.repeat(40) })
    await expect(store.query(generation.id, embedded(theirs, [1, 0, 0, 0]), 1))
      .rejects.toThrow(/not comparable/)
  })

  it('refuses to write a generation with another model\'s vectors', async () => {
    const mine = identity()
    const generation = await store.create(mine)
    const theirs = identity({ dims: 4, maxTokens: 512 })
    await expect(store.upsert(generation.id, [{ key: 'a' }], embedded(theirs, [1, 0, 0, 0])))
      .rejects.toThrow(/not comparable/)
  })

  it('names both fingerprints so the mismatch is diagnosable', async () => {
    const mine = identity()
    const generation = await store.create(mine)
    const theirs = identity({ revision: '1'.repeat(40) })
    await expect(store.query(generation.id, embedded(theirs, [1, 0, 0, 0]), 1))
      .rejects.toThrow(new RegExp(`${mine.fingerprint.slice(0, 12)}[\\s\\S]*${theirs.fingerprint.slice(0, 12)}`))
  })

  it('accepts vectors from the identity it was created with', async () => {
    const mine = identity()
    const generation = await store.create(mine)
    await store.upsert(generation.id, [{ key: 'a' }], embedded(mine, [1, 0, 0, 0]))
    expect(await store.query(generation.id, embedded(mine, [1, 0, 0, 0]), 1)).toHaveLength(1)
  })
})

describe('upsert', () => {
  it('replaces a key rather than accumulating vectors for it', async () => {
    const id = identity()
    const generation = await store.create(id)
    await store.upsert(generation.id, [{ key: 'a', text: 'first' }], embedded(id, [1, 0, 0, 0]))
    await store.upsert(generation.id, [{ key: 'a', text: 'second' }], embedded(id, [0, 1, 0, 0]))

    expect((await store.list())[0]!.records).toBe(1)
    // Ask for more hits than there are records: a duplicated vector shows up
    // here as the same key twice, which a `toHaveLength(1)` on a k=1 query
    // would not catch.
    const hits = await store.query(generation.id, embedded(id, [0, 1, 0, 0]), 5)
    expect(hits.map(hit => hit.key)).toEqual(['a'])
    expect(hits[0]!.text).toBe('second')
    expect(hits[0]!.distance).toBeCloseTo(0, 5)
  })

  it('refuses a record/vector count mismatch instead of pairing them wrongly', async () => {
    const id = identity()
    const generation = await store.create(id)
    await expect(store.upsert(generation.id, [{ key: 'a' }, { key: 'b' }], embedded(id, [1, 0, 0, 0])))
      .rejects.toThrow(/2 records but 1 vectors/)
  })

  it('leaves nothing behind when a batch fails partway', async () => {
    const id = identity()
    const generation = await store.create(id)
    // Second vector is the wrong width, so vec0 rejects it mid-transaction.
    const ragged: EmbedResult = {
      fingerprint: id.fingerprint,
      dims: id.dims,
      vectors: [new Float32Array([1, 0, 0, 0]), new Float32Array([1, 0])],
    }
    await expect(store.upsert(generation.id, [{ key: 'a' }, { key: 'b' }], ragged)).rejects.toThrow()
    // Without the transaction, 'a' would be stored and the generation would
    // silently hold a subset of what was asked for.
    expect((await store.list())[0]!.records).toBe(0)
  })
})

describe('generations', () => {
  it('has no active generation until one is flipped to', async () => {
    await store.create(identity())
    expect(await store.active()).toBeNull()
  })

  it('retires the previous active generation rather than dropping it', async () => {
    const id = identity()
    const first = await store.create(id)
    await store.activate(first.id)
    const second = await store.create(id)
    await store.activate(second.id)

    const byId = new Map((await store.list()).map(generation => [generation.id, generation]))
    expect(byId.get(second.id)!.status).toBe('ready')
    // Retired, not deleted: flipping back is the rollback, so the file has to
    // still be there.
    expect(byId.get(first.id)!.status).toBe('retired')
    expect((await store.active())!.id).toBe(second.id)
  })

  it('clears the manifest when the active generation is dropped', async () => {
    const id = identity()
    const generation = await store.create(id)
    await store.upsert(generation.id, [{ key: 'a' }], embedded(id, [1, 0, 0, 0]))
    await store.activate(generation.id)
    await store.drop(generation.id)

    expect(await store.active()).toBeNull()
    expect(await store.list()).toEqual([])
    expect(existsSync(join(dir, `gen-${generation.id}.db`))).toBe(false)
  })

  it('removes WAL siblings a crashed process left behind', async () => {
    // Asserting this after an ordinary drop proves nothing: SQLite deletes its
    // own `-wal` and `-shm` on a clean close, so the assertion passes whether
    // or not the store does anything. The files that actually matter are
    // orphans from a process that died mid-write -- and a later generation
    // reusing the id would adopt them as its own journal.
    const stale = 'crashed'
    for (const suffix of ['', '-wal', '-shm']) {
      writeFileSync(join(dir, `gen-${stale}.db${suffix}`), 'orphan')
    }
    await store.drop(stale)
    for (const suffix of ['', '-wal', '-shm']) {
      expect(existsSync(join(dir, `gen-${stale}.db${suffix}`)), `gen-${stale}.db${suffix}`).toBe(false)
    }
  })

  it('binds the generation to the identity it was created with', async () => {
    const id = identity({ dims: 4 })
    const generation = await store.create(id)
    expect(generation.fingerprint).toBe(id.fingerprint)
    expect(generation.dims).toBe(4)
    expect(generation.status).toBe('building')
  })
})
