# @se373/embedding

## What it does

Defines what it means to turn text into a vector, and what it means for two
vectors to be comparable. It owns no model and runs no inference: it is the seam
`ctx.embedder`, the identity digest that decides which vectors may be compared
with which, and the conformance suite a provider has to pass.

The design problem it exists to solve is that embedding failures are silent.
Query with the wrong model, or forget that a retrieval encoder wants
`query: …` on one side and `passage: …` on the other, and nothing raises an
error — recall just quietly gets worse, or ranking becomes arbitrary. Every
decision here is aimed at converting one of those silences into a refusal.

Three of them:

- **Identity is a digest over what changes the output**, not the model's name.
  Repository, commit revision, the SHA-256 of every file, native and stored
  width, token budget, both templates, and whether output is normalized. The
  model's `modelId` is deliberately *not* an input — renaming a registry row
  changes no vector, and making a rename invalidate a 300 MB index would teach
  people to distrust the fingerprint.
- **Role is an argument, not a convention.** `embed(texts, 'document' | 'query')`.
  A provider that ignores it passes every shape and norm check there is.
- **Matryoshka truncation renormalizes.** A prefix of a unit vector is not a
  unit vector, and skipping the renormalize makes vector magnitude encode how
  much was discarded, which turns cosine ranking into something else.

## Depends on

| | |
|---|---|
| `@se373/cordis` | `Service`, for the abstract provider base and the `Context` merge |
| `@se373/invariants` | the boot-time companion that checks whatever is mounted |
| `node:crypto` | SHA-256 for the identity digest |

Nothing else. It does not depend on `@se373/model-registry`: where bytes come
from is a different question from what a vector means, and the dependency runs
the other way.

## In / out

**Out — the seam.** `ctx.embedder: Embedder`, an abstract `Service` subclass
providers extend:

```ts
abstract class Embedder extends Service {
  abstract readonly identity: EmbedderIdentity
  abstract readonly readiness: 'ready' | 'blocked'
  abstract embed(texts: readonly string[], role: EmbedRole): Promise<EmbedResult>
}
```

There is no plugin row for the seam. `ctx.provide` claims *ownership* of a name
rather than declaring a namespace, so a row that announced `embedder` would make
the first real provider fail with `service "embedder" has been registered`. The
`declare module` and the abstract base are the whole declaration — the same
shape `@se373/fs` uses upstream.

**Out — the values.**

| Type | Carries |
|---|---|
| `EmbedderIdentity` | repo, revision, artifact digests, `nativeDims`, `dims`, `maxTokens`, `templates`, `normalize`, `fingerprint` |
| `EmbedResult` | `{ fingerprint, dims, vectors }` — one fingerprint for the batch, never bare `Float32Array[]` |

`EmbedResult` is the load-bearing shape. Because provenance travels with the
numbers, a store cannot forget to check what it was handed.

**Out — the helpers.** `fingerprintIdentity` / `sealIdentity`,
`truncateToDims` / `normalizeInPlace`, `applyTemplate` / `templateFault`,
`describeIdentityFault` (free, structural) and `assertEmbedderConformance`
(behavioural, loads a model).

**In.** Nothing configurable. The seam has no config; providers do.

## Known Limitations and Deferred Work

- **The conformance suite's role check needs distinguishable templates.** If a
  model's document and query templates are identical, a provider that ignores
  `role` is indistinguishable from one that honours it, and the check is
  skipped. Both shipped models have distinct templates, so this only bites a
  future symmetric model.
- **Determinism is checked within one process.** Two runs on different hardware
  can differ in the last bits — quantized kernels are not required to be
  bit-identical across execution providers — so the tolerance is `1e-5` rather
  than exact. A cross-machine golden-vector test is not written.
- **`dims` is validated against `nativeDims`, not against the graph.** A row
  claiming a native width the model does not have is caught at inference by
  `@se373/embedder-onnx-local`, not here — the seam never loads a model.
- **No batching or concurrency contract.** Whether `embed` may be called
  re-entrantly is a provider's business; nothing here serializes.
- **No `title` slot.** EmbeddingGemma's document template has one upstream; it is
  pinned to `none` until chunks carry titles, which is phase 6b.
