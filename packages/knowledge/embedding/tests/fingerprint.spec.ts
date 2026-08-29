/**
 * The identity digest decides which vectors may be compared with which. Two
 * ways it can be wrong, both silent:
 *
 * - **A field stops being hashed.** Two genuinely different models then collide
 *   on one fingerprint, and the store — whose whole refusal rests on this value
 *   — happily mixes them. Nothing raises an error; ranking just becomes
 *   arbitrary.
 * - **The digest is unstable.** The same model hashed twice from
 *   differently-ordered inputs looks like two models, and a rebuild that should
 *   have been a no-op invalidates a 300 MB index.
 *
 * The coverage check below runs in both directions: every mutation must change
 * the digest, *and* every key the digest reads must have a mutation. Adding a
 * field to `fingerprintInputs` without adding a case here fails the test, which
 * is the half that survives a refactor.
 */

import { describe, expect, it } from 'vitest'
import { fingerprintIdentity, fingerprintInputs } from '../src/fingerprint.ts'
import type { EmbedderIdentityInput } from '../src/types.ts'

const BASE: EmbedderIdentityInput = {
  modelId: 'demo',
  repo: 'acme/encoder',
  revision: '0'.repeat(40),
  artifacts: [
    { file: 'onnx/model.onnx', sha256: 'a'.repeat(64), bytes: 100 },
    { file: 'tokenizer.json', sha256: 'b'.repeat(64), bytes: 200 },
  ],
  nativeDims: 768,
  dims: 768,
  maxTokens: 2048,
  templates: { document: 'doc: {content}', query: 'q: {content}' },
  normalize: true,
}

/** One mutation per digested field, keyed by the field it is meant to reach. */
const MUTATIONS: Record<string, (input: EmbedderIdentityInput) => EmbedderIdentityInput> = {
  repo: input => ({ ...input, repo: 'acme/other' }),
  revision: input => ({ ...input, revision: '1'.repeat(40) }),
  artifacts: input => ({
    ...input,
    artifacts: [{ ...input.artifacts[0]!, sha256: 'c'.repeat(64) }, input.artifacts[1]!],
  }),
  nativeDims: input => ({ ...input, nativeDims: 384 }),
  dims: input => ({ ...input, dims: 256 }),
  maxTokens: input => ({ ...input, maxTokens: 512 }),
  templates: input => ({ ...input, templates: { ...input.templates, query: 'query: {content}' } }),
  normalize: input => ({ ...input, normalize: false }),
}

describe('fingerprintIdentity', () => {
  it('changes when any digested field changes', () => {
    const base = fingerprintIdentity(BASE)
    for (const [field, mutate] of Object.entries(MUTATIONS)) {
      expect(fingerprintIdentity(mutate(BASE)), `mutating ${field} did not change the digest`)
        .not.toBe(base)
    }
  })

  it('has a mutation for every field it digests', () => {
    // The other direction. Without this, dropping a field from
    // `fingerprintInputs` leaves its mutation case passing vacuously -- the
    // digest still changes, because the mutation also perturbs nothing else,
    // but only by accident of the field being gone.
    expect(Object.keys(fingerprintInputs(BASE)).sort()).toEqual(Object.keys(MUTATIONS).sort())
  })

  it('ignores the row name, which changes no vector', () => {
    expect(fingerprintIdentity({ ...BASE, modelId: 'renamed' })).toBe(fingerprintIdentity(BASE))
  })

  it('is stable across artifact ordering', () => {
    const reversed = { ...BASE, artifacts: [...BASE.artifacts].reverse() }
    expect(fingerprintIdentity(reversed)).toBe(fingerprintIdentity(BASE))
  })

  it('is stable across key insertion order', () => {
    // `JSON.stringify` preserves insertion order, so an identity assembled
    // field-by-field in a different sequence would hash differently while
    // describing the same model. This is the case a canonicalizer exists for.
    const shuffled = {
      normalize: BASE.normalize,
      templates: { query: BASE.templates.query, document: BASE.templates.document },
      maxTokens: BASE.maxTokens,
      dims: BASE.dims,
      nativeDims: BASE.nativeDims,
      artifacts: BASE.artifacts,
      revision: BASE.revision,
      repo: BASE.repo,
      modelId: BASE.modelId,
    } satisfies EmbedderIdentityInput
    expect(fingerprintIdentity(shuffled)).toBe(fingerprintIdentity(BASE))
  })
})
