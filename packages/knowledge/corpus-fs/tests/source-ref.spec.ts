/**
 * `sourceRef` is stage 0 of the generation key, so it has the widest blast
 * radius in the plane: a change here re-crawls, re-chunks, re-embeds and
 * rewrites. Both of its failure modes are quiet.
 *
 * **Too sensitive** — reordering a YAML list, or launching from a different
 * directory, would throw away a working index and cost a full rebuild. People
 * respond to that by not trusting the mechanism.
 *
 * **Not sensitive enough** — narrowing the extension list without changing the
 * ref means documents silently leave the corpus while the index still claims to
 * be current, and retrieval keeps answering from them.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { FilesystemCorpus } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-corpus-fs-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

/** A corpus over the given config. */
function corpus(config: Record<string, unknown>): FilesystemCorpus {
  return new FilesystemCorpus(new Context() as never, config)
}

const alpha = join(root, 'alpha')
const beta = join(root, 'beta')
mkdirSync(join(alpha, 'nested'), { recursive: true })
mkdirSync(join(alpha, 'node_modules'), { recursive: true })
mkdirSync(beta, { recursive: true })
writeFileSync(join(alpha, 'one.md'), '# One\n\nFirst document.\n')
writeFileSync(join(alpha, 'nested', 'two.md'), '# Two\n\nSecond document.\n')
writeFileSync(join(alpha, 'skipped.txt'), 'not markdown')
writeFileSync(join(alpha, 'node_modules', 'dep.md'), '# Dep\n\nShould never be indexed.\n')
writeFileSync(join(beta, 'three.md'), '# Three\n\nThird document.\n')
writeFileSync(join(alpha, 'empty.md'), '   \n')

describe('sourceRef', () => {
  it('ignores the order the roots were listed in', () => {
    expect(corpus({ roots: [alpha, beta] }).sourceRef).toBe(corpus({ roots: [beta, alpha] }).sourceRef)
  })

  it('ignores whether a root was written relatively', () => {
    const relatively = relative(process.cwd(), alpha)
    expect(corpus({ roots: [relatively] }).sourceRef).toBe(corpus({ roots: [resolve(alpha)] }).sourceRef)
  })

  it('ignores a duplicated root', () => {
    expect(corpus({ roots: [alpha, alpha] }).sourceRef).toBe(corpus({ roots: [alpha] }).sourceRef)
  })

  it('changes when the roots change', () => {
    expect(corpus({ roots: [alpha] }).sourceRef).not.toBe(corpus({ roots: [alpha, beta] }).sourceRef)
  })

  it('changes when the extension list narrows', () => {
    // Documents leave the corpus. If the ref did not move, the index would
    // still claim to be current while answering from files no longer in scope.
    expect(corpus({ roots: [alpha], extensions: ['.md', '.txt'] }).sourceRef)
      .not.toBe(corpus({ roots: [alpha], extensions: ['.md'] }).sourceRef)
  })

  it('changes when the size limit changes', () => {
    expect(corpus({ roots: [alpha], maxBytes: 1000 }).sourceRef)
      .not.toBe(corpus({ roots: [alpha], maxBytes: 2000 }).sourceRef)
  })
})

describe('documents', () => {
  /** Collect the crawl. */
  async function crawl(config: Record<string, unknown>): Promise<{ id: string, text: string }[]> {
    const out: { id: string, text: string }[] = []
    for await (const document of corpus(config).documents()) out.push({ id: document.id, text: document.text })
    return out
  }

  it('yields source-relative ids so a checkout can move', async () => {
    // An absolute id would make every document look new on another machine, and
    // orphan every chunk the previous machine wrote.
    const ids = (await crawl({ roots: [alpha] })).map(document => document.id)
    expect(ids).toContain('alpha/one.md')
    expect(ids).toContain('alpha/nested/two.md')
    expect(ids.every(id => !id.startsWith('/'))).toBe(true)
  })

  it('never descends into node_modules', async () => {
    const ids = (await crawl({ roots: [alpha] })).map(document => document.id)
    expect(ids.some(id => id.includes('node_modules'))).toBe(false)
  })

  it('skips files with no content rather than indexing an empty document', async () => {
    const ids = (await crawl({ roots: [alpha] })).map(document => document.id)
    expect(ids).not.toContain('alpha/empty.md')
  })

  it('honours the extension filter', async () => {
    // The default list is ['.md', '.txt'], so both are in scope until narrowed.
    expect((await crawl({ roots: [alpha] })).map(d => d.id)).toContain('alpha/skipped.txt')
    expect((await crawl({ roots: [alpha], extensions: ['.md'] })).map(d => d.id))
      .not.toContain('alpha/skipped.txt')
  })

  it('hashes content, so an untouched file is byte-identical between crawls', async () => {
    const first = corpus({ roots: [alpha] })
    const hashes = new Map<string, string>()
    for await (const document of first.documents()) hashes.set(document.id, document.contentHash)
    for await (const document of corpus({ roots: [alpha] }).documents()) {
      expect(document.contentHash, document.id).toBe(hashes.get(document.id))
    }
  })

  it('takes the title from a leading heading only', async () => {
    // A heading found anywhere would pick up the first section of a file whose
    // real title is elsewhere, and a wrong title travels into every chunk.
    writeFileSync(join(beta, 'untitled.md'), 'Body first.\n\n# Not the title\n')
    const documents = await crawl({ roots: [beta] })
    expect(documents.find(d => d.id === 'beta/three.md')).toBeDefined()
    const untitled = corpus({ roots: [beta] })
    for await (const document of untitled.documents()) {
      if (document.id === 'beta/untitled.md') expect(document.title).toBeNull()
      if (document.id === 'beta/three.md') expect(document.title).toBe('Three')
    }
  })
})
