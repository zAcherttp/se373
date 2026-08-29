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
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import type { IndexStatus, IngestEnd, IngestOptions, IngestProgress, IngestReport, IngestStart, Query, RetrievedChunk, RetrieveOptions, StageRefs } from './types.ts';
export * from './types.ts';
export * from './staleness.ts';
declare module '@se373/cordis' {
    interface Context {
        knowledgePipeline: KnowledgePipeline;
    }
    interface Events {
        /**
         * An ingest began. Unique start; every later event carries the same id.
         * @param event - the ingest's identity, mode and configuration.
         * @mode emit
         */
        'ingest/start'(event: IngestStart): void;
        /**
         * A document was handled.
         * @param event - running counters and the document just seen.
         * @mode emit
         */
        'ingest/progress'(event: IngestProgress): void;
        /**
         * An ingest finished, successfully or not.
         * @param event - the full report.
         * @mode emit
         */
        'ingest/end'(event: IngestEnd): void;
        /**
         * Rewrite a query before it is embedded — expansion, HyDE, tenant scoping.
         * @param query - the request so far.
         * @param next - delegate to the rest of the chain.
         * @mode waterfall
         */
        'knowledge/pre-retrieve'(query: Query, next: () => Query | Promise<Query>): Query | Promise<Query>;
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
        'knowledge/post-retrieve'(hits: readonly RetrievedChunk[], query: Query, next: () => readonly RetrievedChunk[] | Promise<readonly RetrievedChunk[]>): readonly RetrievedChunk[] | Promise<readonly RetrievedChunk[]>;
    }
}
/**
 * Thrown when a destructive rebuild needs an approval it does not have.
 *
 * Deliberately an ordinary error carrying the plan id rather than a wait: a
 * headless run blocked on a click hangs forever, and a thrown plan is a normal
 * tool result a model or a UI can act on — approve, then call
 * `ingest({ planId })`.
 */
export declare class IngestPlanRequiredError extends Error {
    /** Stable machine-readable code. */
    readonly code: "INGEST_PLAN_REQUIRED";
    /** The plan awaiting a decision. */
    readonly planId: string;
    constructor(planId: string, summary: string);
}
/**
 * Chunk metadata keys the pipeline writes and reads back.
 *
 * Named constants because they are a *contract with the store*, not incidental
 * data: a re-embed reconstructs chunks from `scan` alone, so a key renamed on
 * the write side and not the read side would produce a generation of chunks
 * whose documents cannot be identified — which reads as a successful ingest.
 */
export declare const CHUNK_META: {
    readonly documentId: "documentId";
    readonly documentHash: "documentHash";
    readonly index: "chunkIndex";
    readonly title: "title";
};
/** Configuration for the knowledge pipeline. */
export interface Config {
    /** Hits returned by default. */
    readonly k?: number;
    /** Candidates fetched per requested hit. */
    readonly overfetch?: number;
    /** Chunks embedded per batch. */
    readonly batchSize?: number;
}
/**
 * The composed knowledge plane.
 */
export declare class KnowledgePipeline extends Service {
    static readonly name = "knowledge";
    static inject: readonly ["corpusSources", "chunker", "embedder", "vectorStore"];
    static readonly Config: Schema<Config>;
    private readonly k;
    private readonly overfetch;
    private readonly batchSize;
    constructor(ctx: Context, config?: Config);
    /** A digest per write-path stage, read from the live providers. */
    stages(): StageRefs;
    /** The key the live configuration writes under. */
    genKey(): string;
    /** One line per stage, for a human deciding whether to approve a rebuild. */
    private descriptions;
    /** Read stage refs back off a generation's labels. */
    private static refsOf;
    /**
     * How the index on disk compares to the pipeline configured now.
     * @returns the live key, the active generation, and what a rebuild would cost.
     */
    status(): Promise<IndexStatus>;
    /** Everything already in a generation, keyed by chunk key. */
    private readIndex;
    /** Turn a chunk into a store record. */
    private static toRecord;
    /** Embed and write one batch. */
    private write;
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
    ingest(options?: IngestOptions): Promise<IngestReport>;
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
    retrieve(text: string, options?: RetrieveOptions): Promise<RetrievedChunk[]>;
}
export default KnowledgePipeline;
//# sourceMappingURL=index.d.ts.map