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
import { Service } from '@se373/cordis';
import { canonicalDigest } from '@se373/digest';
import { randomUUID } from 'node:crypto';
import z from '@se373/schemastery';
import { contributeNode } from '@se373/runtime-graph';
import { describePlan, firstDivergence, generationKey, rebuildPlan } from "./staleness.js";
import { WRITE_PATH_STAGES } from "./types.js";
export * from "./types.js";
export * from "./staleness.js";
/**
 * Thrown when a destructive rebuild needs an approval it does not have.
 *
 * Deliberately an ordinary error carrying the plan id rather than a wait: a
 * headless run blocked on a click hangs forever, and a thrown plan is a normal
 * tool result a model or a UI can act on — approve, then call
 * `ingest({ planId })`.
 */
export class IngestPlanRequiredError extends Error {
    /** Stable machine-readable code. */
    code = 'INGEST_PLAN_REQUIRED';
    /** The plan awaiting a decision. */
    planId;
    constructor(planId, summary) {
        super(`this ingest is destructive (${summary}) and a plan gate is mounted. `
            + `Approve plan ${planId}, then call ingest({ planId: ${JSON.stringify(planId)} }).`);
        this.name = 'IngestPlanRequiredError';
        this.planId = planId;
    }
}
/** Generation label holding the whole key. */
const KEY_LABEL = 'genKey';
/** Generation label prefix holding one stage digest. */
const STAGE_LABEL = 'stage:';
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
};
/**
 * The composed knowledge plane.
 */
export class KnowledgePipeline extends Service {
    static name = 'knowledge';
    static inject = ['corpusSources', 'chunker', 'embedder', 'vectorStore'];
    static Config = z.object({
        k: z.natural().default(5),
        overfetch: z.natural().default(4),
        batchSize: z.natural().default(16),
    });
    k;
    overfetch;
    batchSize;
    constructor(ctx, config = {}) {
        super(ctx, 'knowledgePipeline');
        this.k = config.k ?? 5;
        this.overfetch = config.overfetch ?? 4;
        this.batchSize = config.batchSize ?? 16;
        contributeNode(ctx, { role: 'core', tier: 'L3', label: 'Knowledge pipeline' });
    }
    /** A digest per write-path stage, read from the live providers. */
    stages() {
        return {
            source: this.ctx.corpusSources.sourceRef,
            chunker: this.ctx.chunker.chunkerRef,
            embedder: this.ctx.embedder.identity.fingerprint,
            store: this.ctx.vectorStore.schemaRef,
        };
    }
    /** The key the live configuration writes under. */
    genKey() {
        return generationKey(this.stages());
    }
    /** One line per stage, for a human deciding whether to approve a rebuild. */
    descriptions() {
        const reranker = this.ctx.get('reranker');
        return {
            source: this.ctx.corpusSources.describe(),
            chunker: this.ctx.chunker.describe(),
            embedder: `${this.ctx.embedder.identity.modelId} at ${this.ctx.embedder.identity.dims}d`,
            store: this.ctx.vectorStore.schemaRef,
            reranker: reranker?.describe() ?? 'none (unmounted; top-k only)',
        };
    }
    /** Read stage refs back off a generation's labels. */
    static refsOf(labels) {
        const refs = {};
        for (const stage of WRITE_PATH_STAGES) {
            const value = labels[STAGE_LABEL + stage];
            if (value === undefined)
                return null;
            refs[stage] = value;
        }
        return refs;
    }
    /**
     * How the index on disk compares to the pipeline configured now.
     * @returns the live key, the active generation, and what a rebuild would cost.
     */
    async status() {
        const stages = this.stages();
        const genKey = generationKey(stages);
        const active = await this.ctx.vectorStore.active();
        const storedRefs = active === null ? null : KnowledgePipeline.refsOf(active.labels);
        const divergence = storedRefs === null ? null : firstDivergence(storedRefs, stages);
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
        };
    }
    /** Everything already in a generation, keyed by chunk key. */
    async readIndex(generationId) {
        const held = new Map();
        for await (const record of this.ctx.vectorStore.scan(generationId)) {
            const meta = record.metadata ?? {};
            held.set(record.key, {
                key: record.key,
                documentId: String(meta[CHUNK_META.documentId] ?? ''),
                documentHash: String(meta[CHUNK_META.documentHash] ?? ''),
            });
        }
        return held;
    }
    /** Turn a chunk into a store record. */
    static toRecord(chunk) {
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
        };
    }
    /** Embed and write one batch. */
    async write(generationId, records) {
        if (records.length === 0)
            return;
        const embedded = await this.ctx.embedder.embed(records.map(record => record.text ?? ''), 'document');
        await this.ctx.vectorStore.upsert(generationId, records, embedded);
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
    async ingest(options = {}) {
        const startedAt = Date.now();
        const ingestId = randomUUID();
        const stages = this.stages();
        const genKey = generationKey(stages);
        const store = this.ctx.vectorStore;
        const active = await store.active();
        const storedRefs = active === null ? null : KnowledgePipeline.refsOf(active.labels);
        const divergence = storedRefs === null ? null : firstDivergence(storedRefs, stages);
        const plan = active === null
            ? null
            : storedRefs === null ? rebuildPlan('source') : divergence === null ? null : rebuildPlan(divergence);
        let mode;
        if (active !== null && plan === null && !(options.force ?? false))
            mode = 'incremental';
        else if (active !== null && plan !== null && !plan.rechunk && !(options.force ?? false))
            mode = 're-embed';
        else
            mode = 'create';
        // §5.5's approval gate, consulted where the destruction is decided rather
        // than where it is rendered. `create` and `re-embed` build a generation;
        // `incremental` is a content update and passes ungated. The digest binds
        // the approval to THIS configuration: if a stage changes between proposal
        // and approval, the genKey moves, the digest no longer matches, and the
        // stale approval cannot run — which is the gate's whole point.
        if (mode !== 'incremental') {
            const gate = this.ctx.get('planGate');
            if (gate !== undefined) {
                const subject = { kind: 'index-rebuild', genKey, mode };
                const digest = canonicalDigest(subject);
                if (options.planId !== undefined) {
                    gate.consume(options.planId, digest);
                }
                else {
                    const rebuild = plan === null ? null : describePlan(plan);
                    const proposed = gate.propose({
                        kind: 'index-rebuild',
                        summary: rebuild ?? `build a new generation under ${genKey.slice(0, 12)}…`,
                        steps: [
                            ...plan === null
                                ? [{ summary: 'crawl, chunk and embed the corpus into a new generation', destructive: false }]
                                : [{ summary: rebuild, destructive: true }],
                            { summary: 'flip the active generation; the previous one is retired, not deleted', destructive: false },
                        ],
                        subject,
                        detail: { stages: this.descriptions(), mode },
                    });
                    if (proposed.status === 'approved') {
                        gate.consume(proposed.id, digest);
                    }
                    else {
                        throw new IngestPlanRequiredError(proposed.id, proposed.summary);
                    }
                }
            }
        }
        const labels = {
            [KEY_LABEL]: genKey,
            ...Object.fromEntries(WRITE_PATH_STAGES.map(stage => [STAGE_LABEL + stage, stages[stage]])),
        };
        const target = mode === 'incremental' && active !== null
            ? active
            : await store.create(this.ctx.embedder.identity, labels);
        this.ctx.emit('ingest/start', {
            ingestId,
            genKey,
            generationId: target.id,
            mode,
            stages: this.descriptions(),
            startedAt,
        });
        let seen = 0;
        let changed = 0;
        let written = 0;
        let removed = 0;
        try {
            if (mode === 're-embed' && active !== null) {
                // The corpus is not touched: the chunks in the previous generation are
                // by definition the ones the current chunker would produce, because the
                // chunker's digest is part of what was compared.
                let batch = [];
                for await (const record of store.scan(active.id)) {
                    batch.push(record);
                    if (batch.length >= this.batchSize) {
                        await this.write(target.id, batch);
                        written += batch.length;
                        batch = [];
                    }
                }
                await this.write(target.id, batch);
                written += batch.length;
                seen = written;
            }
            else {
                const held = mode === 'incremental' ? await this.readIndex(target.id) : new Map();
                // Everything the index holds, so what survives at the end is what the
                // corpus no longer contains.
                const orphaned = new Set(held.keys());
                const force = options.force ?? false;
                let batch = [];
                for await (const document of this.ctx.corpusSources.documents()) {
                    options.signal?.throwIfAborted();
                    seen += 1;
                    const existing = [...held.values()].filter(chunk => chunk.documentId === document.id);
                    const unchanged = !force
                        && existing.length > 0
                        && existing.every(chunk => chunk.documentHash === document.contentHash);
                    if (unchanged) {
                        for (const chunk of existing)
                            orphaned.delete(chunk.key);
                        this.ctx.emit('ingest/progress', { ingestId, documents: seen, changed, chunks: written, current: document.id });
                        continue;
                    }
                    changed += 1;
                    const chunks = this.ctx.chunker.chunk(document);
                    for (const chunk of chunks) {
                        orphaned.delete(chunk.key);
                        batch.push(KnowledgePipeline.toRecord(chunk));
                        if (batch.length >= this.batchSize) {
                            await this.write(target.id, batch);
                            written += batch.length;
                            batch = [];
                        }
                    }
                    this.ctx.emit('ingest/progress', { ingestId, documents: seen, changed, chunks: written, current: document.id });
                }
                await this.write(target.id, batch);
                written += batch.length;
                // The half of incremental ingest that is invisible when missing: a
                // document that shrank from ten chunks to six leaves four whose keys
                // nothing overwrites, and an index that answers from text no document
                // contains any more is wrong in the least detectable way available.
                if (orphaned.size > 0)
                    removed = await store.remove(target.id, [...orphaned]);
            }
            if (options.activate ?? true)
                await store.activate(target.id);
            const report = {
                ingestId,
                generationId: target.id,
                genKey,
                mode,
                documents: { seen, changed, skipped: seen - changed },
                chunks: { written, removed },
                durationMs: Date.now() - startedAt,
                status: 'ok',
            };
            this.ctx.emit('ingest/end', { ...report, endedAt: Date.now() });
            return report;
        }
        catch (error) {
            const report = {
                ingestId,
                generationId: target.id,
                genKey,
                mode,
                documents: { seen, changed, skipped: seen - changed },
                chunks: { written, removed },
                durationMs: Date.now() - startedAt,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            };
            this.ctx.emit('ingest/end', { ...report, endedAt: Date.now() });
            // A failed build-alongside leaves the previous generation serving, which
            // is the whole point of building alongside. A failed incremental leaves a
            // partially updated live index -- acceptable, because it is a content
            // update rather than a configuration change, and re-running converges.
            throw error;
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
    async retrieve(text, options = {}) {
        const status = await this.status();
        if (status.generationId === null) {
            throw new Error('no index has been built; run an ingest first');
        }
        if (status.stale !== null) {
            throw new Error(`refusing to answer from a stale index: ${describePlan(status.stale)}. `
                + `The active generation was written under ${status.activeGenKey?.slice(0, 12) ?? 'an unrecorded key'}…, `
                + `this pipeline writes under ${status.genKey.slice(0, 12)}…. Re-ingest, or restore the previous configuration.`);
        }
        const base = {
            text,
            k: options.k ?? this.k,
            overfetch: options.overfetch ?? this.overfetch,
            metadata: options.metadata ?? {},
        };
        const query = await this.ctx.waterfall('knowledge/pre-retrieve', base, () => base);
        const embedded = await this.ctx.embedder.embed([query.text], 'query');
        const candidates = await this.ctx.vectorStore.query(status.generationId, embedded, Math.max(query.k, query.k * query.overfetch));
        const decorated = candidates.map((hit) => {
            const meta = hit.metadata ?? {};
            const title = meta[CHUNK_META.title];
            return {
                ...hit,
                title: typeof title === 'string' ? title : null,
                documentId: String(meta[CHUNK_META.documentId] ?? ''),
                chunkIndex: Number(meta[CHUNK_META.index] ?? 0),
            };
        });
        const filtered = await this.ctx.waterfall('knowledge/post-retrieve', decorated, query, () => decorated);
        const reranker = this.ctx.get('reranker');
        return reranker === undefined
            ? [...filtered].slice(0, query.k)
            : reranker.rerank(query.text, filtered, query.k);
    }
}
export default KnowledgePipeline;
//# sourceMappingURL=index.js.map