# @se373/vector-store

## What it does

Defines where vectors live and, more importantly, **when two of them are allowed
to be compared**. It stores nothing itself; it is the seam `ctx.vectorStore`, the
generation vocabulary, and one refusal.

The central decision is that **an embedder identity is a property of a
generation, not of the rows inside it.**

The tempting alternative is to tag every stored chunk with the model that
produced it. It is worse, and not marginally: per-row model metadata makes a
mixed-model generation *representable*, so an interrupted re-embed can leave an
index that is half one model and half another, and every query against it
returns a confident, plausible, arbitrary ranking with nothing raising an error.
Binding identity to the generation makes that state unspellable — a row's
membership in a generation is what says which model made it.

What rows *do* carry is a stable key, because incremental re-ingest needs to know
which source changed. That is a different question from which model ran, and
conflating the two is how the first design goes wrong.

The refusal follows from the same idea. `upsert` and `query` take an
`EmbedResult` rather than bare `Float32Array[]`, so provenance travels with the
numbers and a mismatch is structurally detectable rather than something a caller
must remember to check. An optional correctness check in a retrieval system is a
check that is absent on the day it matters.

## Depends on

| | |
|---|---|
| `@se373/cordis` | `Service`, for the abstract provider base and the `Context` merge |
| `@se373/embedding` | `EmbedderIdentity` and `EmbedResult` — what a generation is bound to |

No storage dependency. Providers bring their own.

## In / out

**Out — the seam.** `ctx.vectorStore: VectorStore`, an abstract `Service`
subclass. As with the embedding seam there is no plugin row for it: `ctx.provide`
claims ownership of a name, so a declaring row would collide with the first real
provider.

| Method | Purpose |
|---|---|
| `create(identity)` | a new generation, `status: 'building'`, bound to that model |
| `list()` / `active()` | what exists; what queries should go to |
| `activate(id)` | mark ready and flip; the previous active is retired, not deleted |
| `drop(id)` | delete a generation and its storage |
| `upsert(id, records, embedded)` | insert or replace, keyed by `VectorRecord.key` |
| `query(id, embedded, k)` | nearest neighbours |

**Out — `assertComparable(generation, embedded, 'read' \| 'write')`.** The
refusal, exported so every provider enforces it identically. A store that
accepted what another rejected would make the guarantee a property of the
deployment rather than of the design.

**In.** Nothing configurable; providers carry config.

## Known Limitations and Deferred Work

- **Retirement has no reaper.** `activate` retires the previously active
  generation and `drop` deletes on demand, but nothing prunes retired
  generations automatically. That is deliberate — a retired generation is what
  you flip *back* to — and it means disk grows until someone drops one.
- **`query` takes exactly one vector.** Batch queries would return `Hit[][]`;
  no caller needs it yet.
- **No metric selection.** Distance is whatever the provider's index uses.
  Nothing in the seam names L2 or cosine, and nothing stops two providers from
  disagreeing — which would make `Hit.distance` incomparable across providers.
- **No filtering or hybrid retrieval.** Metadata is stored and returned, never
  queried. Pre-filtering by tenant or path, and any lexical channel, belong to
  phase 6b's `knowledge/pre-retrieve` waterfall.
- **A generation's chunker and corpus are not recorded.** Only the embedder
  identity is. The full write-path fingerprint — source, chunker, embedder,
  store schema — needs the stages phase 6b adds; today two generations built
  from different chunkers are indistinguishable here.
