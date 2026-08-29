/**
 * Golden vectors: the check that catches a change nothing else can see.
 *
 * Every other test in this plane verifies *shape* — widths, norms, determinism,
 * that the role argument is honoured. All of them keep passing if the tokenizer
 * changes, if the quantized weights are re-exported, or if a preprocessing step
 * is quietly reordered, because those move every vector **consistently**. The
 * shapes stay right, the norms stay one, two calls still agree with each other,
 * and the index built afterwards is simply not comparable with the one built
 * before — which is the exact failure the fingerprint exists to prevent and
 * cannot detect, because the fingerprint hashes the files, not what the code
 * does with them.
 *
 * So this compares against recorded output. A drift shows up here as a diff,
 * not as slowly worse recall six weeks later.
 *
 * Skipped when the weights are absent, and loudly: a golden test that silently
 * passes without the model is worse than no golden test.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { BUILTIN_MODELS, resolveRow } from '@se373/model-registry'
import { dshHomePath } from '@se373/home-paths'
import type { EmbedRole } from '@se373/embedding'

interface Golden {
  readonly model: string
  readonly revision: string
  readonly fingerprint: string
  readonly dims: number
  readonly cases: readonly { id: string, role: EmbedRole, text: string }[]
  readonly vectors: Record<string, number[]>
}

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden-vectors.json', import.meta.url), 'utf8'),
) as Golden

const root = process.env['SE373_MODELS_ROOT'] ?? dshHomePath('models')
const row = BUILTIN_MODELS.find(candidate => candidate.id === golden.model)!
const present = (await resolveRow(root, row)).status === 'ready'

if (!present) {
  // eslint-disable-next-line no-console
  console.warn(
    `[golden] skipped: ${golden.model} is not in ${root}. `
    + 'Run `pnpm models:acquire` to make this suite meaningful.',
  )
}

/** Largest absolute component-wise difference. */
function maxDelta(left: readonly number[], right: Float32Array): number {
  let worst = 0
  for (let i = 0; i < left.length; i += 1) worst = Math.max(worst, Math.abs(left[i]! - right[i]!))
  return worst
}

describe.skipIf(!present)('recorded vectors', () => {
  it('reproduces every recorded vector', { timeout: 120_000 }, async () => {
    const ctx = new Context() as never as {
      plugin: (plugin: unknown, config: unknown) => Promise<unknown>
      embedder: {
        identity: { fingerprint: string, dims: number }
        readiness: string
        embed: (texts: string[], role: EmbedRole) => Promise<{ vectors: Float32Array[] }>
      }
    }
    const { ModelRegistryService } = await import('@se373/model-registry')
    const { OnnxLocalEmbedder } = await import('../src/index.ts')
    await ctx.plugin(ModelRegistryService, { root })
    await ctx.plugin(OnnxLocalEmbedder, { model: golden.model, batchSize: 4 })

    expect(ctx.embedder.readiness).toBe('ready')
    // If this differs, the *declaration* changed and the vectors below are
    // expected to change too -- regenerate rather than loosening the tolerance.
    expect(ctx.embedder.identity.fingerprint).toBe(golden.fingerprint)
    expect(ctx.embedder.identity.dims).toBe(golden.dims)

    for (const testCase of golden.cases) {
      const result = await ctx.embedder.embed([testCase.text], testCase.role)
      const recorded = golden.vectors[testCase.id]!
      expect(result.vectors[0]!.length, testCase.id).toBe(recorded.length)
      // 1e-3 rather than exact: the fixture is rounded to five decimals, and
      // quantized kernels are not required to be bit-identical across execution
      // providers. Far tighter than any real drift -- reordering a
      // preprocessing step moves components by whole percent.
      expect(maxDelta(recorded, result.vectors[0]!), testCase.id).toBeLessThan(1e-3)
    }
  })

  it('keeps the two languages closer to each other than to the query form', { timeout: 120_000 }, async () => {
    // A weaker claim than the vectors above, but one a human can check: the
    // English and Vietnamese renderings of the same sentence are embedded as
    // documents and should sit near each other, while the query-role vector of
    // a different sentence should not. If a template were dropped, or the role
    // argument ignored, this ordering is what breaks first.
    const dot = (a: readonly number[], b: readonly number[]): number =>
      a.reduce((sum, value, index) => sum + value * b[index]!, 0)
    const en = golden.vectors['en-document']!
    const vi = golden.vectors['vi-document']!
    const query = golden.vectors['en-query']!
    expect(dot(en, vi)).toBeGreaterThan(dot(en, query))
  })
})
