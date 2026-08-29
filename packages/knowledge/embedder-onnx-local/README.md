# @se373/embedder-onnx-local

## What it does

Fills `ctx.embedder` by running an ONNX encoder in this process. No API key, no
router, no network once the weights are on disk — which is invariant I2's point:
an agent whose retrieval stage needs a credential before it can return a single
vector is not alive on arrival.

It is written so that as much as possible is **derived from the loaded graph
rather than declared in config**, because a declaration can be wrong:

- which tensors to feed comes from `session.inputNames`, so a model wanting
  `token_type_ids` and one wanting `position_ids` both work, and one wanting
  something unheard-of fails by name instead of as a shape error three layers
  down;
- whether the model pools for us comes from `session.outputNames`.
  `sentence_embedding` means the export baked in mean-pooling, the Matryoshka
  dense heads and normalization — that is EmbeddingGemma. `last_hidden_state`
  means token vectors this package must mask-and-mean itself — that is E5.

**Loading is lazy and absence is a mounted state.** If the bytes are missing the
row still mounts, `identity` still reads, the node still appears on the runtime
graph, and only `embed` refuses — with the command that fixes it.

## Depends on

| | |
|---|---|
| `onnxruntime-node` | inference. Its install script downloads the platform's native runtime; approved in `pnpm-workspace.yaml` |
| `@lenml/tokenizers` | loads `tokenizer.json` offline, from JSON, with no network and no Python |
| `@se373/embedding` | the abstract `Embedder` base, templating, truncation, the identity digest |
| `@se373/model-registry` | injected as `ctx.modelRegistry`; resolves the row to file paths |
| `@se373/cordis`, `@se373/schemastery` | service and config |

`@lenml/tokenizers` is a no-dependency fork of transformers.js's tokenizer half.
It was chosen empirically: it round-trips Gemma's `GemmaTokenizer` byte-exactly,
including Vietnamese diacritics. The risk that it drifts is bounded by the
conformance suite rather than by the dependency's maturity.

## In / out

**In — config.**

| Field | Default | Meaning |
|---|---|---|
| `model` | the registry's default row | which `ModelRow` to load |
| `dims` | that row's `dims` | stored width; must be one of the row's `mrlDims` |
| `batchSize` | `16` | texts per forward pass |

`dims` is inside the fingerprint, so changing it invalidates an index exactly as
changing the model would. That is the point: one download backs 768, 512, 256
and 128, and the store still refuses to mix them.

**Out.** `ctx.embedder`, an `Embedder`. `embed(texts, role)` templates each text
for its role, tokenizes with padding and truncation, runs the graph in chunks of
`batchSize`, pools if the graph did not, truncates to `dims` with a renormalize,
and returns one `EmbedResult` carrying the fingerprint.

Also `readiness` (`'ready' | 'blocked'`) and `blockedReason`.

## Known Limitations and Deferred Work

- **CPU only.** `executionProviders: ['cpu']` is hardcoded. CoreML, CUDA and
  DirectML exist in `onnxruntime-node` and are not exposed; they would change
  numerics, so they would have to enter the fingerprint before being offered.
- **No golden-vector test.** Conformance checks shape, norm, determinism and
  role-sensitivity — all within one process. A tokenizer or quantization change
  that shifted every vector consistently would pass. Recorded vectors compared at
  a tolerance would catch it and are not written, because they require the
  weights to be present in CI.
- **Chunking pads per batch.** One long text in a batch pads every other row out
  to its length. There is no length-sorting or token-budget packing, so a corpus
  of mixed lengths costs more than it needs to.
- **`embed` is not serialized.** Two concurrent calls share one
  `InferenceSession`. ONNX Runtime tolerates this, but nothing here bounds
  memory if a caller fans out.
- **Blocked is detected once, at init.** Acquiring a model while the process is
  running does not flip `readiness` — the row has to reload.
- **The tokenizer is trusted to match the export.** `tokenizer.json` and the
  graph are pinned together by revision, so they cannot skew independently, but
  nothing verifies that the tokenizer the export was traced with is this one.
