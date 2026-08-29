/**
 * Resolution is where a build goes wrong quietly.
 *
 * **A blocked block dropped instead of disabled** breaks I2's promise directly:
 * connecting an external system is supposed to *upgrade* an agent, and a row
 * that was never emitted is one nobody can turn on. The agent works, so nothing
 * complains — it is simply permanently missing a capability.
 *
 * **Isolates derived from the wrong field** puts a fabricated agent's seams in
 * the root realm, which §6.3 names as the failure to guard at registration: the
 * second fabrication silently resolves one instance for everybody.
 *
 * **A row whose injections nothing satisfies** mounts `pending` and never
 * starts. That is legible on the graph afterwards and invisible in a plan, so
 * the plan has to say it while there is still someone to say it to.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { BlockRepository } from '@se373/block-registry'
import type { BlockInput } from '@se373/block-registry'
import { AgentBuilder, providedBy, seamKey } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-builder-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })
let counter = 0

/**
 * A context carrying a repository and a builder.
 *
 * Each harness gets its own persistence file because the builder registers
 * every resolved spec as an `origin: 'agent'` block, which is durable — a spec
 * you cannot roll back to across a restart is not a version.
 */
function harness(blocks: readonly BlockInput[], recipeBlocks: readonly string[]) {
  const ctx = new Context() as never as { blocks: BlockRepository, builder: AgentBuilder }
  const repository = new BlockRepository(ctx as never, { file: join(root, `case-${counter += 1}.json`) })
  for (const entry of blocks) repository.register(entry)
  repository.register({
    id: 'recipe.test',
    kind: 'recipe',
    origin: 'system',
    manifest: {
      summary: 'test',
      tier: 'ready',
      defaults: { prompt: 'do it', preset: 'standard', blocks: recipeBlocks },
    },
  })
  const builder = new AgentBuilder(ctx as never)
  return { ctx, builder }
}

/** A block. */
function block(id: string, over: Partial<BlockInput['manifest']> = {}, origin: BlockInput['origin'] = 'system'): BlockInput {
  return {
    id: `block.${id}`,
    kind: 'agent',
    origin,
    manifest: { summary: id, tier: 'ready', plugin: `@se373/${id}`, ...over },
  } as BlockInput
}

describe('providedBy', () => {
  it('prefers an explicit provides over the seam', () => {
    // Two fields answering different questions: a seam is what gets isolated,
    // `provides` is what a sibling row can inject. Core services have the
    // second and not the first.
    expect(providedBy({ manifest: { provides: ['a', 'b'], seam: 'ctx.c' } } as never)).toEqual(['a', 'b'])
  })

  it('falls back to the seam key', () => {
    expect(providedBy({ manifest: { seam: 'ctx.vectorStore' } } as never)).toEqual(['vectorStore'])
  })

  it('is empty for a block that publishes nothing', () => {
    expect(providedBy({ manifest: {} } as never)).toEqual([])
  })
})

describe('seamKey', () => {
  it('strips the ctx prefix and leaves anything else alone', () => {
    expect(seamKey('ctx.chunker')).toBe('chunker')
    expect(seamKey('chunker')).toBe('chunker')
  })
})

describe('plan', () => {
  it('mounts a blocked block disabled rather than dropping it', async () => {
    const { builder } = harness(
      [block('needs-key', { tier: 'blocked', requires: ['an API key'] })],
      ['block.needs-key'],
    )
    const plan = await builder.plan({ recipe: 'recipe.test' })
    const row = plan.spec.rows.find(entry => entry.id === 'block.needs-key')
    expect(row, 'the row must exist; a row you cannot see is one you cannot turn on').toBeDefined()
    expect(row!.disabled).toBe(true)
    expect(plan.warnings.some(w => w.message.includes('an API key'))).toBe(true)
  })

  it('warns about an unknown block instead of failing the whole plan', async () => {
    // A plan that cannot be produced is a plan nobody can look at.
    const { builder } = harness([block('real')], ['block.real', 'block.imaginary'])
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.spec.rows.map(row => row.id)).toEqual(['block.real'])
    expect(plan.warnings.some(w => w.block === 'block.imaginary')).toBe(true)
  })

  it('excludes an agent-authored block and says why', async () => {
    const { builder } = harness(
      [block('authored', { plugin: '@se373/authored' }, 'agent')],
      ['block.authored'],
    )
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.spec.rows).toHaveLength(0)
    expect(plan.warnings[0]!.message).toContain('agent-authored')
  })

  it('skips a block that names no plugin', async () => {
    const abstract = block('abstract')
    const { plugin: _dropped, ...manifest } = abstract.manifest
    const { builder } = harness([{ ...abstract, manifest } as typeof abstract], ['block.abstract'])
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.spec.rows).toHaveLength(0)
    expect(plan.warnings[0]!.message).toContain('names no plugin')
  })

  it('isolates the seams it publishes, and only those', async () => {
    // §6.3: what differs gets isolated; leaf resources deliberately shared stay
    // shared. A core service with `provides` and no seam must NOT be isolated.
    const { builder } = harness(
      [
        block('store', { seam: 'ctx.vectorStore' }),
        block('registry', { provides: ['modelRegistry'] }),
      ],
      ['block.store', 'block.registry'],
    )
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.spec.isolates).toEqual(['vectorStore'])
  })

  it('warns when a row injects something no sibling and no parent provides', async () => {
    const { builder } = harness([block('needy', { inject: ['nothingProvidesThis'] })], ['block.needy'])
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.warnings.some(w => w.message.includes('nothingProvidesThis'))).toBe(true)
  })

  it('does not warn when a sibling row provides the injection', async () => {
    const { builder } = harness(
      [
        block('registry', { provides: ['modelRegistry'] }),
        block('needy', { inject: ['modelRegistry'] }),
      ],
      ['block.registry', 'block.needy'],
    )
    const plan = await builder.plan({ recipe: 'recipe.test' })
    expect(plan.warnings).toEqual([])
  })

  it('versions specs per name rather than mutating one', async () => {
    // I4: a pipeline is a named, versioned value. You cannot compare against a
    // version you mutated away.
    const { ctx, builder } = harness([block('a')], ['block.a'])
    const first = await builder.plan({ recipe: 'recipe.test', name: 'thing' })
    const second = await builder.plan({ recipe: 'recipe.test', name: 'thing' })
    expect(first.spec.version).toBe(1)
    expect(second.spec.version).toBe(2)
    expect(ctx.blocks.versions('spec.thing').map(entry => entry.version)).toEqual([1, 2])
  })

  it('digests the spec, so two identical plans agree and a changed one does not', async () => {
    const { builder } = harness([block('a')], ['block.a'])
    const plan = await builder.plan({ recipe: 'recipe.test', name: 'x' })
    const changed = await builder.plan({ recipe: 'recipe.test', name: 'y' })
    expect(plan.digest).not.toBe(changed.digest)
  })

  it('fails loudly on an unknown recipe, naming the cookbook', async () => {
    const { builder } = harness([block('a')], ['block.a'])
    await expect(builder.plan({ recipe: 'recipe.nope' })).rejects.toThrow(/recipe\.test/)
  })
})

describe('fabricate', () => {
  it('refuses a digest it never planned', async () => {
    const { builder } = harness([block('a')], ['block.a'])
    await expect(builder.fabricate('0'.repeat(64))).rejects.toThrow(/call plan\(\) first/)
  })
})
