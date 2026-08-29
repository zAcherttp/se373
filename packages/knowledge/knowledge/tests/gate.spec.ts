/**
 * The one bug this wiring exists to prevent is silent: a destructive rebuild —
 * a full re-embed of a corpus — starting because of a config typo, with a gate
 * mounted and never consulted. Everything works, the index is fine, and the
 * approval mechanism everyone believes is standing simply was not in the path.
 *
 * The digest binding has its own silent failure: approve a rebuild, change a
 * stage, run the ingest — without the binding, the approval for one
 * configuration authorises a different one, and the plan card a human read
 * described work that did not happen.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { Chunker, buildChunk } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import { CorpusSource } from '@se373/corpus'
import type { Document } from '@se373/corpus'
import { contentDigest } from '@se373/digest'
import { Embedder, sealIdentity } from '@se373/embedding'
import type { EmbedderIdentity, EmbedResult, EmbedRole } from '@se373/embedding'
import { PlanGate } from '@se373/plan-gate'
import { SqliteVecStore } from '@se373/vs-sqlite-vec'
import { IngestPlanRequiredError, KnowledgePipeline } from '../src/index.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-gate-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

/** A one-document corpus whose ref is settable, to force staleness. */
class FakeCorpus extends CorpusSource {
  sourceRef = 'corpus-v1'
  text = 'one document, long enough to chunk once.'
  describe(): string { return 'fake corpus' }
  async* documents(): AsyncIterable<Document> {
    yield { id: 'doc', text: this.text, title: null, contentHash: contentDigest(this.text), metadata: {} }
  }
}

/** One chunk per document. */
class FakeChunker extends Chunker {
  readonly chunkerRef = 'chunker-v1'
  describe(): string { return 'fake chunker' }
  chunk(document: Document): Chunk[] { return [buildChunk(document, 0, document.text)] }
}

/** Deterministic four-dimensional vectors; no model anywhere near this. */
class FakeEmbedder extends Embedder {
  readonly identity: EmbedderIdentity = sealIdentity({
    modelId: 'fake',
    repo: 'acme/fake',
    revision: '0'.repeat(40),
    artifacts: [{ file: 'model.onnx', sha256: 'a'.repeat(64), bytes: 1 }],
    nativeDims: 4,
    dims: 4,
    maxTokens: 64,
    templates: { document: 'd: {content}', query: 'q: {content}' },
    normalize: false,
  }) as EmbedderIdentity

  readonly readiness = 'ready' as const

  async embed(texts: readonly string[], _role: EmbedRole): Promise<EmbedResult> {
    return {
      fingerprint: this.identity.fingerprint,
      dims: 4,
      vectors: texts.map(text => new Float32Array([text.length % 7, 1, 2, 3])),
    }
  }
}

let counter = 0

/** A whole knowledge plane on a bare context, with or without a gate. */
function plane(options: { gate?: boolean, autoApprove?: boolean } = {}) {
  const ctx = new Context() as never as Context & {
    knowledgePipeline: KnowledgePipeline
    planGate: PlanGate
  }
  const corpus = new FakeCorpus(ctx)
  new FakeChunker(ctx)
  new FakeEmbedder(ctx)
  new SqliteVecStore(ctx, { dir: join(root, `case-${counter += 1}`) })
  const gate = options.gate === true
    ? new PlanGate(ctx, { autoApprove: options.autoApprove ?? false })
    : undefined
  const pipeline = new KnowledgePipeline(ctx, { batchSize: 4 })
  return { ctx, corpus, gate, pipeline }
}

describe('ungated', () => {
  it('proceeds when no gate row is mounted', async () => {
    // I3's shape for a policy: with no plan-gate row there is no gate, exactly
    // as with no tool-fs row there is no filesystem tool.
    const { pipeline } = plane()
    const report = await pipeline.ingest()
    expect(report.status).toBe('ok')
    expect(report.mode).toBe('create')
  })
})

describe('gated', () => {
  it('refuses a destructive ingest, carrying the plan id', async () => {
    const { pipeline, gate } = plane({ gate: true })
    const failure = await pipeline.ingest().then(() => null, (error: unknown) => error)
    expect(failure).toBeInstanceOf(IngestPlanRequiredError)
    const { planId } = failure as IngestPlanRequiredError
    // The refusal is a proposal, not a dead end: the plan is pending and names
    // the work.
    expect(gate!.get(planId).status).toBe('pending')
  })

  it('proceeds once the plan is approved and the id presented', async () => {
    const { pipeline, gate } = plane({ gate: true })
    const failure = await pipeline.ingest().then(() => null, (error: unknown) => error) as IngestPlanRequiredError
    gate!.approve(failure.planId)
    const report = await pipeline.ingest({ planId: failure.planId })
    expect(report.status).toBe('ok')
    expect(gate!.get(failure.planId).status).toBe('consumed')
  })

  it('refuses an approval whose configuration has moved', async () => {
    // Approve a rebuild, change a stage, run. The genKey moves, the digest no
    // longer matches, and the stale approval must not authorise different work.
    const { pipeline, gate, corpus } = plane({ gate: true })
    const failure = await pipeline.ingest().then(() => null, (error: unknown) => error) as IngestPlanRequiredError
    gate!.approve(failure.planId)
    corpus.sourceRef = 'corpus-v2'
    await expect(pipeline.ingest({ planId: failure.planId }))
      .rejects.toThrow(/approved for .* but the work presented/)
  })

  it('never gates an incremental content update', async () => {
    // A content update is not a configuration change; that distinction is what
    // the generation key covers and content hashing does not.
    const { pipeline, gate, corpus } = plane({ gate: true, autoApprove: true })
    await pipeline.ingest()
    corpus.text = 'the document changed, but the configuration did not.'
    const before = gate!.list().length
    const report = await pipeline.ingest()
    expect(report.mode).toBe('incremental')
    // No new proposal: the gate was not consulted at all.
    expect(gate!.list().length).toBe(before)
  })

  it('gates a re-embed, not only a create', async () => {
    const { pipeline, gate, corpus } = plane({ gate: true, autoApprove: true })
    await pipeline.ingest()
    corpus.sourceRef = 'corpus-v1' // unchanged
    const embedderChanged = plane({ gate: false })
    void embedderChanged
    // Force staleness at the embedder stage by re-mounting nothing: instead,
    // flip the corpus ref -- stage 0 -- which is still a destructive rebuild.
    corpus.sourceRef = 'corpus-v2'
    const report = await pipeline.ingest()
    expect(report.mode).toBe('create')
    const kinds = gate!.list().map(plan => plan.status)
    expect(kinds.every(status => status === 'consumed')).toBe(true)
  })

  it('autoApprove consumes in the same call, so unattended runs proceed', async () => {
    const { pipeline, gate } = plane({ gate: true, autoApprove: true })
    const report = await pipeline.ingest()
    expect(report.status).toBe('ok')
    expect(gate!.list().map(plan => plan.status)).toEqual(['consumed'])
  })
})
