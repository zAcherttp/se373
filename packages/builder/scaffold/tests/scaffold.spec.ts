/**
 * Every rule here guards a write the model will one day request.
 *
 * **Overwrite is the catastrophic one**: the copy-on-write story — forks beside
 * originals, v2 beside v1 — is only true if writing over an existing name is
 * impossible. A scaffold that overwrote would let a fork replace the block it
 * forked from, which is the exact mutation the whole design exists to prevent.
 *
 * **Traversal is the security one**: fork file lists become model-authored at
 * 6d, and `../` in a filename must be an error, not an instruction.
 *
 * **Partial trees are the silent one**: a half-written fork that later mounts
 * looks like a complete fork that misbehaves.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { listScaffolds, removeScaffold, ScaffoldError, writeScaffold } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-scaffold-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('writeScaffold', () => {
  it('writes the tree and returns the directory', () => {
    const dir = writeScaffold(root, 'agent-v1', {
      'preset/agent/preset.yml': 'name: Agent\n',
      'preset/agent/agent.cordis.yml': '- id: persona\n',
      'workspace/': '',
    })
    expect(readFileSync(join(dir, 'preset/agent/preset.yml'), 'utf8')).toBe('name: Agent\n')
    expect(existsSync(join(dir, 'workspace'))).toBe(true)
  })

  it('never overwrites an existing name', () => {
    writeScaffold(root, 'taken', { 'a.txt': 'original' })
    expect(() => writeScaffold(root, 'taken', { 'a.txt': 'usurper' }))
      .toThrow(ScaffoldError)
    // The original is untouched -- by construction, not by luck.
    expect(readFileSync(join(root, 'taken/a.txt'), 'utf8')).toBe('original')
  })

  it('refuses a name that is not a single safe segment', () => {
    for (const name of ['../escape', 'has/slash', '.hidden', 'UPPER', '']) {
      expect(() => writeScaffold(root, name, {}), name).toThrow(/SCAFFOLD_NAME|must match/)
    }
  })

  it('refuses a tree path that escapes the scaffold', () => {
    expect(() => writeScaffold(root, 'sneaky', { '../outside.txt': 'x' })).toThrow(/escapes/)
    // Nothing was created: validation runs before the first write.
    expect(existsSync(join(root, 'sneaky'))).toBe(false)
    expect(existsSync(join(root, 'outside.txt'))).toBe(false)
  })

  it('refuses an absolute tree path', () => {
    expect(() => writeScaffold(root, 'absolute', { [join(tmpdir(), 'se373-abs.txt')]: 'x' }))
      .toThrow(/escapes/)
  })

  it('leaves nothing behind when a write fails partway', () => {
    // The second entry's parent directory collides with the FILE the first
    // entry just wrote, so mkdir fails after one file exists -- a genuine
    // mid-tree failure, not a pre-write refusal. (An earlier version of this
    // test pre-created the scaffold directory to plant a read-only trap, which
    // tripped SCAFFOLD_EXISTS before anything was written and exercised
    // nothing.)
    expect(() => writeScaffold(root, 'halfway', { 'a': 'i am a file', 'a/child.txt': 'needs a to be a dir' }))
      .toThrow()
    expect(existsSync(join(root, 'halfway'))).toBe(false)
  })

  it('lists and removes what it wrote', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'se373-scaffold-list-'))
    writeScaffold(fresh, 'one', {})
    writeScaffold(fresh, 'two', {})
    expect(listScaffolds(fresh)).toEqual(['one', 'two'])
    removeScaffold(fresh, 'one')
    expect(listScaffolds(fresh)).toEqual(['two'])
    rmSync(fresh, { recursive: true, force: true })
  })
})
