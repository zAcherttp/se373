# @se373/rerank-none

## What it does

Fills `ctx.reranker` by keeping the store's own order and taking the first `k`.

**Not a no-op.** The pipeline over-fetches so the post-retrieve waterfall has
candidates to dedup and diversify; this is the stage that reduces the survivors
back to `k`. What it declines to do is *rescore*, which is the part that would
need a second model.

It is the honest default for the same reason `embedder-onnx-local` is: a
cross-encoder is another download and another forward pass per candidate, and
invariant I2 says the plane has to answer before anyone has paid either cost.

## Depends on

`@se373/rerank` for the abstract base, `@se373/vector-store` for `Hit`,
`@se373/digest` for `rerankerRef`, `@se373/cordis` for `Service`. No model, no
network, no config.

## In / out

**In.** Nothing configurable.

**Out.** `ctx.reranker`. `rerank(query, hits, k)` returns `hits.slice(0, k)`,
preserving order and the caller's hit type. `describe()` returns
`'none (vector order, top-k only)'`, which is what the index status shows.

## Known Limitations and Deferred Work

- **The query argument is ignored**, by definition. That means this provider
  cannot distinguish a candidate that merely resembles the query's topic from one
  that answers it — which is exactly the gap a cross-encoder closes.
- **`rerankerRef` digests an empty config**, so it is a constant. It exists to
  keep the shape uniform across providers, not to carry information.
- **No tie-breaking.** Two candidates at identical distance keep whatever order
  the store returned, which for `vs-sqlite-vec` is rowid order — stable, but
  arbitrary.
