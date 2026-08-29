# @se373/rerank

## What it does

Defines `ctx.reranker`: the stage that reduces a candidate list to the answer.

The **only stage of the plane that is not index-invalidating**. It is on the read
path, so swapping it changes what a query returns without touching a stored
vector — which is why `rerankerRef` is reported in the index status and
deliberately excluded from the generation key. A read-path change that
invalidated the index would make experimenting with ranking cost a rebuild,
which is the opposite of what the read/write split is for.

The stage exists because vector search alone is a poor final ranker. The
pipeline over-fetches — several times `k` — so dedup and diversity have material
to work with, and something has to reduce that back to `k`. That reduction is
this seam. `rerank-none` keeps the store's order; a cross-encoder would rescore
first. Both answer the same question, which is what makes it a seam rather than
an optional decoration.

**Optional to mount.** A pipeline with no reranker truncates to `k` itself, so
an unmounted seam degrades to `rerank-none`'s behaviour rather than to a crash —
invariant I2's defaulted tier.

## Depends on

`@se373/vector-store` for `Hit`, `@se373/cordis` for `Service`.

## In / out

**Out — the seam.** `ctx.reranker: Reranker`, an abstract `Service` subclass:

```ts
abstract rerank<T extends Hit>(query: string, hits: readonly T[], k: number): Promise<T[]>
```

Generic in the hit type so a reranker cannot strip fields a caller added. The
pipeline hands it hits decorated with a title and a document id; a signature
fixed to `Hit` would silently return them undecorated, and the loss would
surface as a missing heading rather than as a type error.

## Known Limitations and Deferred Work

- **One provider ships, and it does not rescore.** `rerank-cross-encoder` is
  named in the architecture and does not exist, so nothing has exercised the
  seam against a provider that actually reorders — which is the case the
  generic signature and the over-fetch were designed for.
- **No score is returned.** A rescoring provider has nowhere to put its own
  score: `Hit.distance` is the vector store's, and overwriting it would make the
  number mean two different things depending on which provider is mounted.
- **No latency budget.** A cross-encoder is a forward pass per candidate, and
  nothing in the seam lets a caller bound how long reranking may take or fall
  back when it does not finish.
