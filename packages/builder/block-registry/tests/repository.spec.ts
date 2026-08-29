/**
 * A repository that quietly stops being one fails in ways nothing reports.
 *
 * **A register that replaces instead of appending** destroys the version a
 * comparison or a rollback names. `spec.x@1` still resolves — to whatever `x`
 * is now — so the comparison runs and compares the same thing to itself.
 *
 * **A fork that shadows its original** removes the thing you wanted to compare
 * against. The design's claim is that the original survives *by construction*,
 * not by policy, and construction is what these check.
 *
 * **A mount policy that lets an agent-authored block through** is I7 with the
 * rail removed. It works, right up until the block does not.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { BlockRepository, blockRef, parseBlockRef } from '../src/index.ts'
import type { BlockInput } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-blocks-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

let counter = 0

/** A repository with its own persistence file. */
function repository(): BlockRepository {
  return new BlockRepository(new Context() as never, { file: join(root, `case-${counter += 1}.json`) })
}

/** A minimal block. */
function block(id: string, over: Partial<BlockInput> = {}): BlockInput {
  return {
    id,
    kind: 'agent',
    origin: 'system',
    manifest: { summary: id, tier: 'ready', plugin: `@se373/${id}` },
    ...over,
  } as BlockInput
}

describe('versions', () => {
  it('appends rather than replaces', () => {
    const repo = repository()
    repo.register(block('a'))
    repo.register(block('a', { manifest: { summary: 'second', tier: 'ready' } }))
    expect(repo.versions('a').map(entry => entry.version)).toEqual([1, 2])
    expect(repo.get('a')!.version).toBe(2)
  })

  it('keeps old versions retrievable by number', () => {
    // What `forkedFrom` and a rollback both depend on. If v1 is gone, `a@1`
    // resolves to nothing and the comparison it names cannot be run.
    const repo = repository()
    repo.register(block('a', { manifest: { summary: 'first', tier: 'ready' } }))
    repo.register(block('a', { manifest: { summary: 'second', tier: 'ready' } }))
    expect(repo.at('a', 1)!.manifest.summary).toBe('first')
    expect(repo.at('a', 2)!.manifest.summary).toBe('second')
  })

  it('lists only the newest version of each id', () => {
    const repo = repository()
    repo.register(block('a'))
    repo.register(block('a'))
    repo.register(block('b'))
    expect(repo.list().map(entry => `${entry.id}@${entry.version}`)).toEqual(['a@2', 'b@1'])
  })
})

describe('forks', () => {
  it('never reuses the original id', () => {
    const repo = repository()
    repo.register(block('a'))
    const fork = repo.fork('a', { origin: 'user' })
    expect(fork.id).not.toBe('a')
    expect(repo.get('a')!.origin).toBe('system')
  })

  it('records parentage as id@version, resolvable afterwards', () => {
    const repo = repository()
    repo.register(block('a'))
    repo.register(block('a'))
    const fork = repo.fork('a', { origin: 'user' })
    expect(fork.forkedFrom).toBe('a@2')
    const parent = parseBlockRef(fork.forkedFrom!)!
    expect(repo.at(parent.id, parent.version)).toBeDefined()
  })

  it('allocates a fresh ordinal per fork', () => {
    const repo = repository()
    repo.register(block('a'))
    expect(repo.fork('a', { origin: 'user' }).id).toBe('a.fork-1')
    expect(repo.fork('a', { origin: 'user' }).id).toBe('a.fork-2')
  })

  it('refuses an explicit id that would shadow the original', () => {
    const repo = repository()
    repo.register(block('a'))
    expect(() => repo.fork('a', { origin: 'user', id: 'a' })).toThrow(/may not reuse/)
  })

  it('carries the parent manifest through, with overrides applied', () => {
    const repo = repository()
    repo.register(block('a', { manifest: { summary: 'orig', tier: 'defaulted', plugin: '@se373/a' } }))
    const fork = repo.fork('a', { origin: 'agent', manifest: { summary: 'mine' } })
    expect(fork.manifest.summary).toBe('mine')
    expect(fork.manifest.tier).toBe('defaulted')
    expect(fork.manifest.plugin).toBe('@se373/a')
  })
})

describe('mount policy', () => {
  it('lets system and user blocks mount directly', () => {
    const repo = repository()
    repo.register(block('sys', { origin: 'system' }))
    repo.register(block('usr', { origin: 'user' }))
    expect(repo.mountable('sys').allowed).toBe(true)
    expect(repo.mountable('usr').allowed).toBe(true)
  })

  it('refuses an agent-authored block until its suite passes', () => {
    // I7's rail. Without this, `origin` is decoration.
    const repo = repository()
    repo.register(block('bot', { origin: 'agent', conformance: 'ctx.vectorStore' }))
    const verdict = repo.mountable('bot')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('ctx.vectorStore')
  })

  it('refuses an agent-authored block that names no suite at all', () => {
    const repo = repository()
    repo.register(block('bot', { origin: 'agent' }))
    expect(repo.mountable('bot').allowed).toBe(false)
    expect(repo.mountable('bot').reason).toContain('nothing could vouch')
  })

  it('refuses an unknown id rather than defaulting to allowed', () => {
    expect(repository().mountable('nope').allowed).toBe(false)
  })
})

describe('persistence', () => {
  it('reloads non-system blocks and forgets system ones', () => {
    // System blocks are re-registered by their own rows at every boot, so
    // persisting them would create a second, staler source for something the
    // config already decides.
    const file = join(root, 'persist.json')
    const first = new BlockRepository(new Context() as never, { file })
    first.register(block('sys', { origin: 'system' }))
    first.register(block('mine', { origin: 'user' }))

    const second = new BlockRepository(new Context() as never, { file })
    expect(second.get('mine')).toBeDefined()
    expect(second.get('sys')).toBeUndefined()
  })

  it('treats a corrupt file as an empty repository rather than crashing', () => {
    const file = join(root, 'corrupt.json')
    const seed = new BlockRepository(new Context() as never, { file })
    seed.register(block('mine', { origin: 'user' }))
    rmSync(file)
    expect(() => new BlockRepository(new Context() as never, { file })).not.toThrow()
  })
})

describe('references', () => {
  it('round-trips id@version, including ids containing dots', () => {
    expect(parseBlockRef(blockRef({ id: 'recipe.internal-knowledge', version: 3 })))
      .toEqual({ id: 'recipe.internal-knowledge', version: 3 })
  })

  it('rejects malformed references rather than guessing', () => {
    expect(parseBlockRef('no-version')).toBeNull()
    expect(parseBlockRef('@2')).toBeNull()
    expect(parseBlockRef('a@0')).toBeNull()
    expect(parseBlockRef('a@x')).toBeNull()
  })
})
