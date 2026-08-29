# @se373/knowledge

## What it does

Composes the four write-path stages into `ctx.knowledgePipeline`, and owns the
three things no individual stage can:

**The generation key, and therefore staleness.** Each stage knows its own digest;
only the composition knows whether the index on disk was written by the pipeline
configured *now*, and which stage diverged first. §5.5 makes this the authority
rather than any declared flag — an authored block can misstate a boolean, and a
flag-based system would then serve from a poisoned index with no error.

**The cascade.** Invalidation is positional: a change at stage N invalidates N to
the end and nothing before it. Embedding dominates the cost and chunking does
not, so an embedder swap reads the chunks back from the previous generation and
never touches the corpus. Full rebuild is not a separate feature; it is the
degenerate case where stage 0 changed.

**Content identity.** Documents carry a hash; this is what compares it to what
the index already holds, skips the unchanged ones, and sweeps the chunks a
*shrunken* document left behind — the half of incremental ingest that is easy to
forget and invisible when missing, because an index answering from text no
document contains any more raises no error.

A **core service, not a seam**: there is one composition at a time, and §5.6 is
explicit that the consumer boundary is this service and never an individual
stage, which is what makes a stage swap invisible to the tool.

## Depends on

| | |
|---|---|
| `ctx.corpusSources`, `ctx.chunker`, `ctx.embedder`, `ctx.vectorStore` | injected; the four write-path stages |
| `ctx.reranker` | read opportunistically, not injected — an unmounted reranker degrades to top-k |
| `@se373/digest` | the generation key |
| `@se373/runtime-graph` | `contributeNode`, so the pipeline appears on the graph as `core`/L3 |
| `@se373/cordis`, `@se373/schemastery` | service and config |

## In / out

**In — config.** `k` (default 5), `overfetch` (4), `batchSize` (16).

**Out — `ctx.knowledgePipeline`.**

| Method | Purpose |
|---|---|
| `stages()` / `genKey()` | the live per-stage digests and their key |
| `status()` | active generation, records, `activeGenKey`, and a `RebuildPlan` when stale |
| `ingest(options?)` | crawl or re-embed or update incrementally, then flip |
| `retrieve(text, options?)` | `RetrievedChunk[]`, best first |

**Out — events.** `ingest/start`, `ingest/progress`, `ingest/end` (each carrying
one stable `ingestId`), and two waterfalls: `knowledge/pre-retrieve`
(`Query → Query`) and `knowledge/post-retrieve` (`RetrievedChunk[] → …`).

`post-retrieve` runs on the **over-fetched** list, ahead of the reranker, so
removing a duplicate costs an answer slot rather than wasting one, and a
rescoring reranker does not spend a forward pass on a near-duplicate.

**Ingest has three paths**, chosen by the cascade rather than by an argument:
`create` (nothing usable, or corpus/chunker changed), `re-embed` (only the
embedder or store schema changed — chunks are read back from the previous
generation), and `incremental` (configuration unchanged, so this is a content
update). The first two build alongside and flip; the third writes into the live
generation, because a configuration change is a destructive change and a content
update is not.

**Retrieval fails closed on staleness**, naming both keys and the rebuild plan.

## Known Limitations and Deferred Work

- **Incremental ingest scans the whole index first**, to learn which documents
  it holds and at which hashes. That is O(index) per ingest and holds one entry
  per chunk in memory.
- **Incremental writes into the live generation.** A crash mid-ingest leaves it
  partially updated. Defensible — a content update is not a destructive change,
  and re-running converges — but it is not atomic, and nothing reports the gap.
- **A store-schema change re-embeds.** §5.5's table says it should only rewrite,
  but `scan` returns chunks without their vectors, so there is nothing to copy
  forward. The plan reports the spec; the executor does more.
- **No approval gate.** §5.5 requires a destructive change to be plan-gated,
  stating which stages rebuild and how long it takes. `status()` returns
  everything such a card needs and nothing presents it or blocks on it; that
  arrives with the builder plane.
- **Nothing drains in-flight queries before a flip.** `activate` switches the
  pointer immediately.
- **`ingest/progress` fires per document**, so a single very large document is
  silent for as long as it takes.
- **Retrieval is single-query.** No batching, and `k`/`overfetch` are the only
  controls — no MMR, no score threshold, no metadata filter.
