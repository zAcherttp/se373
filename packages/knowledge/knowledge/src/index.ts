/**
 * `ctx.knowledgePipeline` — the composed knowledge plane.
 *
 * A **core service, not a seam.** There is one composition of the four stages
 * at a time; a second would be a second index, and §5.6 is explicit that the
 * consumer boundary is this service and never an individual stage — which is
 * what makes a stage swap invisible to the tool.
 *
 * It owns three things no individual stage can:
 *
 * - **The generation key**, and therefore staleness. Each stage knows its own
 *   digest; only the composition knows whether the index on disk was written by
 *   the pipeline that is configured now, and which stage diverged first.
 * - **The cascade.** §5.5's positional rule is a statement about the *order* of
 *   stages, so the thing that knows the order executes it. An embedder swap
 *   reads chunks back from the previous generation rather than re-crawling.
 * - **Content identity.** Documents carry a hash; the pipeline is what compares
 *   it to what the index already holds and skips the unchanged ones — and what
 *   sweeps the chunks a shrunken document left behind, which is the half of
 *   incremental ingest that is easy to forget and invisible when missing.
 *
 * @module @se373/knowledge
 */

import { Context, Service } from '@se373/cordis'
import { randomUUID } from 'node:crypto'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { contributeNode } from '@se373/runtime-graph'
import type {} from '@se373/corpus'
import type { Chunk } from '@se373/chunker'
import type {} from '@se373/chunker'
import type {} from '@se373/embedding'
import type { VectorRecord } from '@se373/vector-store'
import type {} from '@se373/vector-store'
import type { Reranker } from '@se373/rerank'
import { describePlan, firstDivergence, generationKey, rebuildPlan } from './staleness.ts'
import { WRITE_PATH_STAGES } from './types.ts'
import type {
  IndexStatus,
  IngestEnd,
  IngestMode,
  IngestOptions,
  IngestProgress,
  IngestReport,
  IngestStart,
  Query,
  RetrievedChunk,
  RetrieveOptions,
  StageRefs,
} from './types.ts'

export * from './types.ts'
export * from './staleness.ts'

declare module '@se373/cordis' {
  interface Context {
    knowledgePipeline: KnowledgePipeline
  }

  interface Events {
    /**
     * An ingest began. Unique start; every later event carries the same id.
     * @param event - the ingest's identity, mode and configuration.
     * @mode emit
     */
    'ingest/start'(event: IngestStart): void
    /**
     * A document was handled.
     * @param event - running counters and the document just seen.
     * @mode emit
     */
    'ingest/progress'(event: IngestProgress): void
    /**
     * An ingest finished, successfully or not.
     * @param event - the full report.
     * @mode emit
     */
    'ingest/end'(event: IngestEnd): void
    /**
     * Rewrite a query before it is embedded — expansion, HyDE, tenant scoping.
     * @param query - the request so far.
     * @param next - delegate to the rest of the chain.
     * @mode waterfall
     */
    'knowledge/pre-retrieve'(query: Query, next: () => Query | Promise<Query>): Query | Promise<Query>
    /**
     * Reshape candidates before they are reduced to `k` — dedup, diversity.
     *
     * Runs on the **over-fetched** list, ahead of the reranker, so that removing
     * a duplicate does not cost an answer and a rescoring reranker does not
     * spend a forward pass on one.
     * @param hits - candidates, nearest first.
     * @param query - the resolved query.
     * @param next - delegate to the rest of the chain.
     * @mode waterfall
     */
    'knowledge/post-retrieve'(
      hits: readonly RetrievedChunk[],
      query: Query,
      next: () => readonly RetrievedChunk[] | Promise<readonly RetrievedChunk[]>,
    ): readonly RetrievedChunk[] | Promise<readonly RetrievedChunk[]>
  }
}

/** Generation label holding the whole key. */
const KEY_LABEL = 'genKey'
/** Generation label prefix holding one stage digest. */
const STAGE_LABEL = 'stage:'

/**
 * Chunk metadata keys the pipeline writes and reads back.
 *
 * Named constants because they are a *contract with the store*, not incidental
 * data: a re-embed reconstructs chunks from `scan` alone, so a key renamed on
 * the write side and not the read side would produce a generation of chunks
 * whose documents cannot be identified — which reads as a successful ingest.
 */
export const CHUNK_META = {
  documentId: 'documentId',
  documentHash: 'documentHash',
  index: 'chunkIndex',
  title: 'title',
} as const

/** Configuration for the knowledge pipeline. */
export interface Config {
  /** Hits returned by default. */
  readonly k?: number
  /** Candidates fetched per requested hit. */
  readonly overfetch?: number
  /** Chunks embedded per batch. */
  readonly batchSize?: number
}

/** A stored record as the pipeline understands it. */
interface StoredChunk {
  readonly key: string
  readonly documentId: string
  readonly documentHash: string
}

/**
 * The composed knowledge plane.
 */
export class KnowledgePipeline extends Service {
  static override readonly name = 'knowledge'
  static inject = ['corpusSources', 'chunker', 'embedder', 'vectorStore'] as const

  static readonly Config: Schema<Config> = z.object({
    k: z.natural().default(5),
    overfetch: z.natural().default(4),
    batchSize: z.natural().default(16),
  }) as Schema<Config>

  private readonly k: number
  private readonly overfetch: number
  private readonly batchSize: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'knowledgePipeline')
    this.k = config.k ?? 5
    this.overfetch = config.overfetch ?? 4
    this.batchSize = config.batchSize ?? 16
    contributeNode(ctx, { role: 'core', tier: 'L3', label: 'Knowledge pipeline' })
  }

  /** A digest per write-path stage, read from the live providers. */
  stages(): StageRefs {
    return {
      source: this.ctx.corpusSources.sourceRef,
      chunker: this.ctx.chunker.chunkerRef,
      embedder: this.ctx.embedder.identity.fingerprint,
      store: this.ctx.vectorStore.schemaRef,
    }
  }

  /** The key the live configuration writes under. */
  genKey(): string {
    return generationKey(this.stages())
  }

  /** One line per stage, for a human deciding whether to approve a rebuild. */
  private descriptions(): Record<string, string> {
    const reranker = this.ctx.get('reranker') as Reranker | undefined
    return {
      source: this.ctx.corpusSources.describe(),
      chunker: this.ctx.chunker.describe(),
      embedder: `${this.ctx.embedder.identity.modelId} at ${this.ctx.embedder.identity.dims}d`,
      store: this.ctx.vectorStore.schemaRef,
      reranker: reranker?.describe() ?? 'none (unmounted; top-k only)',
    }
  }

  /** Read stage refs back off a generation's labels. */
  private static refsOf(labels: Readonly<Record<string, string>>): StageRefs | null {
    const refs: Partial<Record<string, string>> = {}
    for (const stage of WRITE_PATH_STAGES) {
      const value = labels[STAGE_LABEL + stage]
      if (value === undefined) return null
      refs[stage] = value
    }
    return refs as StageRefs
  }

  /**
   * How the index on disk compares to the pipeline configured now.
   * @returns the live key, the active generation, and what a rebuild would cost.
   */
  async status(): Promise<IndexStatus> {
    const stages = this.stages()
    const genKey = generationKey(stages)
    const active = await this.ctx.vectorStore.active()
    const storedRefs = active === null ? null : KnowledgePipeline.refsOf(active.labels)
    const divergence = storedRefs === null ? null : firstDivergence(storedRefs, stages)
    return {
      genKey,
      stages,
      generationId: active?.id ?? null,
      records: active?.records ?? 0,
      activeGenKey: active?.labels[KEY_LABEL] ?? null,
      // An active generation whose labels cannot be read at all is treated as
      // maximally stale rather than as compatible: it was written by something
      // that did not record its stages, and guessing that it agrees is the one
      // wrong answer that produces silence instead of an error.
      stale: active === null
        ? null
        : storedRefs === null
          ? rebuildPlan('source')
          : divergence === null ? null : rebuildPlan(divergence),
      describe: this.descriptions(),
    }
  }

  /** Everything already in a generation, keyed by chunk key. */
  private async readIndex(generationId: string): Promise<Map<string, StoredChunk>> {
    const held = new Map<string, StoredChunk>()
    for await (const record of this.ctx.vectorStore.scan(generationId)) {
      const meta = record.metadata ?? {}
      held.set(record.key, {
        key: record.key,
        documentId: String(meta[CHUNK_META.documentId] ?? ''),
        documentHash: String(meta[CHUNK_META.documentHash] ?? ''),
      })
    }
    return held
  }

  /** Turn a chunk into a store record. */
  private static toRecord(chunk: Chunk): VectorRecord {
    return {
      key: chunk.key,
      text: chunk.text,
      metadata: {
        ...chunk.metadata,
        [CHUNK_META.documentId]: chunk.documentId,
        [CHUNK_META.documentHash]: chunk.documentHash,
        [CHUNK_META.index]: chunk.index,
        [CHUNK_META.title]: chunk.title,
      },
    }
  }

  /** Embed and write one batch. */
  private async write(generationId: string, records: readonly VectorRecord[]): Promise<void> {
    if (records.length === 0) return
    const embedded = await this.ctx.embedder.embed(records.map(record => record.text ?? ''), 'document')
    await this.ctx.vectorStore.upsert(generationId, records, embedded)
  }

  /**
   * Crawl, chunk, embed and store.
   *
   * Three paths, chosen by §5.5's cascade rather than by an argument:
   *
   * - **create** — nothing usable exists, or the corpus or chunker changed. Full
   *   crawl into a new generation.
   * - **re-embed** — only the embedder or the store schema changed, so the
   *   chunks are still correct. They are read back from the previous generation
   *   and re-embedded into a new one; the corpus is never touched.
   * - **incremental** — the configuration is unchanged, so this is a content
   *   update. Documents whose hash matches what the index holds are skipped, the
   *   rest are re-chunked, and chunks left behind by shrunken or deleted
   *   documents are swept.
   *
   * The first two build alongside and flip; the third writes into the live
   * generation, because a configuration change is a destructive change and a
   * content update is not — that distinction is exactly what the generation key
   * covers and content hashing does not.
   * @param options - force, activation, cancellation.
   * @returns what happened.
   */
  async ingest(options: IngestOptions = {}): Promise<IngestReport> {
    const startedAt = Date.now()
    const ingestId = randomUUID()
    const stages = this.stages()
    const genKey = generationKey(stages)
    const store = this.ctx.vectorStore

    const active = await store.active()
    const storedRefs = active === null ? null : KnowledgePipeline.refsOf(active.labels)
    const divergence = storedRefs === null ? null : firstDivergence(storedRefs, stages)
    const plan = active === null
      ? null
      : storedRefs === null ? rebuildPlan('source') : divergence === null ? null : rebuildPlan(divergence)

    let mode: IngestMode
    if (active !== null && plan === null && !(options.force ?? false)) mode = 'incremental'
    else if (active !== null && plan !== null && !plan.rechunk && !(options.force ?? false)) mode = 're-embed'
    else mode = 'create'

    const labels = {
      [KEY_LABEL]: genKey,
      ...Object.fromEntries(WRITE_PATH_STAGES.map(stage => [STAGE_LABEL + stage, stages[stage]])),
    }
    const target = mode === 'incremental' && active !== null
      ? active
      : await store.create(this.ctx.embedder.identity, labels)

    this.ctx.emit('ingest/start', {
      ingestId,
      genKey,
      generationId: target.id,
      mode,
      stages: this.descriptions(),
      startedAt,
    })

    let seen = 0
    let changed = 0
    let written = 0
    let removed = 0

    try {
      if (mode === 're-embed' && active !== null) {
        // The corpus is not touched: the chunks in the previous generation are
        // by definition the ones the current chunker would produce, because the
        // chunker's digest is part of what was compared.
        let batch: VectorRecord[] = []
        for await (const record of store.scan(active.id)) {
          batch.push(record)
          if (batch.length >= this.batchSize) {
            await this.write(target.id, batch)
            written += batch.length
            batch = []
          }
        }
        await this.write(target.id, batch)
        written += batch.length
        seen = written
      } else {
        const held = mode === 'incremental' ? await this.readIndex(target.id) : new Map<string, StoredChunk>()
        // Everything the index holds, so what survives at the end is what the
        // corpus no longer contains.
        const orphaned = new Set(held.keys())
        const force = options.force ?? false
        let batch: VectorRecord[] = []

        for await (const document of this.ctx.corpusSources.documents()) {
          options.signal?.throwIfAborted()
          seen += 1
          const existing = [...held.values()].filter(chunk => chunk.documentId === document.id)
          const unchanged = !force
            && existing.length > 0
            && existing.every(chunk => chunk.documentHash === document.contentHash)
          if (unchanged) {
            for (const chunk of existing) orphaned.delete(chunk.key)
            this.ctx.emit('ingest/progress', { ingestId, documents: seen, changed, chunks: written, current: document.id })
            continue
          }
          changed += 1
          const chunks = this.ctx.chunker.chunk(document)
          for (const chunk of chunks) {
            orphaned.delete(chunk.key)
            batch.push(KnowledgePipeline.toRecord(chunk))
            if (batch.length >= this.batchSize) {
              await this.write(target.id, batch)
              written += batch.length
              batch = []
            }
          }
          this.ctx.emit('ingest/progress', { ingestId, documents: seen, changed, chunks: written, current: document.id })
        }
        await this.write(target.id, batch)
        written += batch.length

        // The half of incremental ingest that is invisible when missing: a
        // document that shrank from ten chunks to six leaves four whose keys
        // nothing overwrites, and an index that answers from text no document
        // contains any more is wrong in the least detectable way available.
        if (orphaned.size > 0) removed = await store.remove(target.id, [...orphaned])
      }

      if (options.activate ?? true) await store.activate(target.id)

      const report: IngestReport = {
        ingestId,
        generationId: target.id,
        genKey,
        mode,
        documents: { seen, changed, skipped: seen - changed },
        chunks: { written, removed },
        durationMs: Date.now() - startedAt,
        status: 'ok',
      }
      this.ctx.emit('ingest/end', { ...report, endedAt: Date.now() })
      return report
    } catch (error) {
      const report: IngestReport = {
        ingestId,
        generationId: target.id,
        genKey,
        mode,
        documents: { seen, changed, skipped: seen - changed },
        chunks: { written, removed },
        durationMs: Date.now() - startedAt,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }
      this.ctx.emit('ingest/end', { ...report, endedAt: Date.now() })
      // A failed build-alongside leaves the previous generation serving, which
      // is the whole point of building alongside. A failed incremental leaves a
      // partially updated live index -- acceptable, because it is a content
      // update rather than a configuration change, and re-running converges.
      throw error
    }
  }

  /**
   * Retrieve.
   *
   * **Fails closed on staleness.** §5.5 is explicit: a query whose live
   * generation key does not match the store's recorded one refuses rather than
   * answering. Answering from an index built by a different pipeline is the
   * failure this whole plane is arranged to prevent, and it is invisible — the
   * hits look like hits.
   * @param text - the query.
   * @param options - k, overfetch, and metadata for the waterfalls.
   * @returns at most `k` hits, best first.
   */
  async retrieve(text: string, options: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
    const status = await this.status()
    if (status.generationId === null) {
      throw new Error('no index has been built; run an ingest first')
    }
    if (status.stale !== null) {
      throw new Error(
        `refusing to answer from a stale index: ${describePlan(status.stale)}. `
        + `The active generation was written under ${status.activeGenKey?.slice(0, 12) ?? 'an unrecorded key'}…, `
        + `this pipeline writes under ${status.genKey.slice(0, 12)}…. Re-ingest, or restore the previous configuration.`,
      )
    }

    const base: Query = {
      text,
      k: options.k ?? this.k,
      overfetch: options.overfetch ?? this.overfetch,
      metadata: options.metadata ?? {},
    }
    const query = await this.ctx.waterfall('knowledge/pre-retrieve', base, () => base)

    const embedded = await this.ctx.embedder.embed([query.text], 'query')
    const candidates = await this.ctx.vectorStore.query(
      status.generationId,
      embedded,
      Math.max(query.k, query.k * query.overfetch),
    )

    const decorated = candidates.map((hit): RetrievedChunk => {
      const meta = hit.metadata ?? {}
      const title = meta[CHUNK_META.title]
      return {
        ...hit,
        title: typeof title === 'string' ? title : null,
        documentId: String(meta[CHUNK_META.documentId] ?? ''),
        chunkIndex: Number(meta[CHUNK_META.index] ?? 0),
      }
    })
    const filtered = await this.ctx.waterfall('knowledge/post-retrieve', decorated, query, () => decorated)
    const reranker = this.ctx.get('reranker') as Reranker | undefined
    return reranker === undefined
      ? [...filtered].slice(0, query.k)
      : reranker.rerank(query.text, filtered, query.k)
  }
}

export default KnowledgePipeline
