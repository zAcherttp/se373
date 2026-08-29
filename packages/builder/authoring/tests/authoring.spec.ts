/**
 * The pipeline that lets model code into a live tree, tested at its refusals.
 *
 * Certification is the one write that turns `origin: 'agent'` from a refusal
 * into a mount, so every early exit matters more than the happy path: a stage
 * that passes what it should fail is I7 with the rail quietly removed, and a
 * gate that approves different bytes than were written is I8's exact hole.
 *
 * The typecheck stage spawns a real tsc, so this spec is seconds, not
 * milliseconds. That is the price of the claim: model code that "works" under
 * type stripping while lying about its seam types is precisely what the stage
 * exists to stop, and a mocked compiler would test the mock.
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { BlockRepository } from '@se373/block-registry'
import { PlanGate } from '@se373/plan-gate'
import { AuthoringService, AuthoringPlanRequiredError } from '../src/index.ts'

// Forks must live inside the repository for @se373/* imports to resolve (the
// module note explains why), so the spec writes under a gitignored temp
// directory INSIDE the workspace rather than in the OS tmpdir.
const root = mkdtempSync(join(import.meta.dirname, '..', '..', '..', '..', 'forks', 'spec-'))
const files = mkdtempSync(join(tmpdir(), 'se373-authoring-'))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(files, { recursive: true, force: true })
})

let counter = 0

/** A harness with a repository holding a forkable chunker block. */
function harness(options: { gate?: boolean, autoApprove?: boolean } = {}) {
  const ctx = new Context() as never as Context & {
    blocks: BlockRepository
    authoring: AuthoringService
    planGate: PlanGate
  }
  const blocks = new BlockRepository(ctx as never, { file: join(files, `repo-${counter += 1}.json`) })
  blocks.register({
    id: 'block.chunker-markdown',
    kind: 'agent',
    origin: 'system',
    conformance: 'ctx.chunker',
    manifest: { summary: 'markdown chunker', tier: 'ready', plugin: '@se373/chunker-markdown', seam: 'ctx.chunker' },
  })
  if (options.gate === true) new PlanGate(ctx as never, { autoApprove: options.autoApprove ?? false })
  const authoring = new AuthoringService(ctx as never, { root })
  return { ctx, blocks, authoring }
}

/** A correct fork: extends the shipped chunker, strips YAML front matter. */
const GOOD_FORK = `import { MarkdownChunker } from '@se373/chunker-markdown'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
import { stageDigest } from '@se373/digest'

/** The shipped markdown chunker, minus YAML front matter. */
export default class FrontMatterChunker extends MarkdownChunker {
  override readonly chunkerRef = stageDigest('front-matter-chunker', {})

  override chunk(document: Document): Chunk[] {
    const text = document.text.replace(/^---\\n[\\s\\S]*?\\n---\\n/, '')
    return super.chunk({ ...document, text })
  }
}
`

describe('the pipeline', () => {
  it('certifies a correct fork, and the registry then allows the mount', { timeout: 60_000 }, async () => {
    const { blocks, authoring } = harness()
    const report = await authoring.author({
      forkOf: 'block.chunker-markdown',
      name: `good-${counter}`,
      files: { 'index.ts': GOOD_FORK },
    })
    expect(report.status, report.output).toBe('certified')
    expect(report.passed).toEqual(['gate', 'write', 'syntax', 'typecheck', 'conformance', 'certify'])
    const verdict = blocks.mountable(report.block!.id)
    expect(verdict.allowed).toBe(true)
    expect(report.block!.origin).toBe('agent')
    expect(report.block!.forkedFrom).toBe('block.chunker-markdown@1')
  })

  it('fails syntax before a compiler ever starts', async () => {
    const { authoring } = harness()
    const report = await authoring.author({
      forkOf: 'block.chunker-markdown',
      name: `syntax-${counter}`,
      files: { 'index.ts': 'export default class {{{' },
    })
    expect(report.status).toBe('failed')
    expect(report.stage).toBe('syntax')
  })

  it('fails typecheck on code that lies about its seam types', { timeout: 60_000 }, async () => {
    // Parses fine, strips fine, and chunk() returns the wrong shape. Type
    // stripping would mount this; the real tsc is what stops it.
    const { authoring, blocks } = harness()
    const report = await authoring.author({
      forkOf: 'block.chunker-markdown',
      name: `liar-${counter}`,
      files: {
        'index.ts': `import { Chunker } from '@se373/chunker'
import type { Document } from '@se373/corpus'
export default class Liar extends Chunker {
  readonly chunkerRef = 'liar-v1'
  describe(): string { return 'liar' }
  chunk(document: Document): string[] { return [document.text] }
}
`,
      },
    })
    expect(report.status).toBe('failed')
    expect(report.stage).toBe('typecheck')
    expect(report.output).toContain('chunk')
    expect(blocks.get(`liar-${counter}`)).toBeUndefined()
  })

  it('fails conformance on code that typechecks and breaks the contract', { timeout: 60_000 }, async () => {
    // Well-typed, and it drops half of every document. The suite's coverage
    // check is the only thing standing between this and an index.
    const { authoring, blocks } = harness()
    const report = await authoring.author({
      forkOf: 'block.chunker-markdown',
      name: `lossy-${counter}`,
      files: {
        'index.ts': `import { Chunker, buildChunk } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
export default class Lossy extends Chunker {
  readonly chunkerRef = 'lossy-v1'
  describe(): string { return 'lossy' }
  chunk(document: Document): Chunk[] {
    return [buildChunk(document, 0, document.text.slice(0, Math.floor(document.text.length / 2)))]
  }
}
`,
      },
    })
    expect(report.status).toBe('failed')
    expect(report.stage).toBe('conformance')
    expect(report.output).toContain('text was lost')
    // An uncertified fork is not in the registry at all: registration is the
    // last stage, so a failed attempt leaves no block to accidentally compose.
    expect(blocks.get(`lossy-${counter}`)).toBeUndefined()
    // ...and no scaffold either: repair retries under the same name, and a
    // corpse from the failed attempt would make every retry die on collision.
    expect(existsSync(join(root, `lossy-${counter}`))).toBe(false)
  })

  it('refuses a re-author over an existing fork directory', { timeout: 60_000 }, async () => {
    const { authoring } = harness()
    const name = `taken-${counter}`
    await authoring.author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK } })
    const second = await authoring.author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK } })
    expect(second.status).toBe('failed')
    expect(second.stage).toBe('write')
    expect(second.output).toContain('never overwrites')
  })
})

describe('the gate', () => {
  it('refuses before anything is written, and the approval binds the exact files', { timeout: 60_000 }, async () => {
    const { ctx, authoring } = harness({ gate: true })
    const name = `gated-${counter}`
    const refused = await authoring
      .author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK } })
      .then(() => null, (error: unknown) => error)
    expect(refused).toBeInstanceOf(AuthoringPlanRequiredError)
    // I8: nothing was written to forks/ before approval.
    expect(existsSync(join(root, name))).toBe(false)

    const { planId } = refused as AuthoringPlanRequiredError
    ctx.planGate.approve(planId)
    // The approved bytes are not these bytes: one character changed.
    const tampered = await authoring
      .author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': `${GOOD_FORK}\n// edited` }, planId })
      .then(() => null, (error: unknown) => error)
    expect(String(tampered)).toContain('approved for')
    expect(existsSync(join(root, name))).toBe(false)

    const report = await authoring.author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK }, planId })
    expect(report.status).toBe('certified')
  })
})

describe('repair and staging', () => {
  it('a failed attempt can be re-authored under the same name, and the suite judges the NEW bytes', { timeout: 60_000 }, async () => {
    // The arc the demo performs, pinned here because it broke twice in one
    // afternoon: first the failed attempt's scaffold blocked the retry
    // (cleanup), then Node's module cache handed the suite the BROKEN class
    // for the corrected bytes (the ?sha key). Either regression makes repair
    // impossible while looking like the model's code is still wrong.
    const { authoring, blocks } = harness()
    const name = `repair-${counter}`
    const broken = await authoring.author({
      forkOf: 'block.chunker-markdown',
      name,
      files: {
        'index.ts': `import { Chunker, buildChunk } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
export default class Half extends Chunker {
  readonly chunkerRef = 'half-v1'
  describe(): string { return 'half' }
  chunk(document: Document): Chunk[] {
    return [buildChunk(document, 0, document.text.slice(Math.floor(document.text.length / 2)))]
  }
}
`,
      },
    })
    expect(broken.status).toBe('failed')
    const fixed = await authoring.author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK } })
    expect(fixed.status, fixed.output).toBe('certified')
    expect(blocks.mountable(name).allowed).toBe(true)
  })

  it('recheck judges edited bytes and decertify withdraws the vouch', { timeout: 60_000 }, async () => {
    const { authoring, blocks } = harness()
    const name = `staged-${counter}`
    const authored = await authoring.author({ forkOf: 'block.chunker-markdown', name, files: { 'index.ts': GOOD_FORK } })
    expect(authored.status).toBe('certified')

    const passed = await authoring.recheck(name)
    expect(passed.status).toBe('passed')

    // The edit breaks the contract. recheck must judge THESE bytes.
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(root, name, 'index.ts'), `import { Chunker, buildChunk } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
export default class Broken extends Chunker {
  readonly chunkerRef = 'broken-v1'
  describe(): string { return 'broken edit' }
  chunk(document: Document): Chunk[] {
    return [buildChunk(document, 0, document.text.slice(0, 10))]
  }
}
`)
    const rejected = await authoring.recheck(name)
    expect(rejected.status).toBe('rejected')
    if (rejected.status === 'rejected') expect(rejected.output).toContain('text was lost')

    blocks.decertify(name)
    expect(blocks.mountable(name).allowed).toBe(false)
  })
})
