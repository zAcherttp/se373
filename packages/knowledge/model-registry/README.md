# @se373/model-registry

## What it does

Answers three questions about model weights: which models are usable, whether
this machine has them, and how to get them. It knows nothing about inference —
that is the provider's job — and the provider knows nothing about downloading,
which is why these are two packages.

The rule it enforces is that **weights are never fetched as a side effect of
using the harness**. A row is a declaration; having the bytes is a separate,
deliberate act. A provider whose row is declared and whose bytes are absent
mounts *blocked* and says what is missing, rather than starting a 331 MB
download inside somebody's first query.

Two properties make the declaration trustworthy:

- **Rows pin bytes, not names.** A commit revision, never a branch, plus a
  SHA-256 and a byte length for every file. `repo@main` can be re-uploaded;
  `repo@5090578` with a digest cannot.
- **A model is a file *set*.** ONNX exports over a couple of hundred megabytes
  split their weights into a `.onnx_data` sidecar whose name is recorded *inside*
  the graph, so pinning one file pins nothing and the cache must mirror
  repository paths verbatim.

Two rows ship, and they disagree with each other on purpose — 768d Matryoshka
against 384d fixed, 2048 tokens against 512, task templates against bare
prefixes. A registry whose rows all looked alike would not have caught the
per-generation width rule.

## Depends on

| | |
|---|---|
| `@se373/cordis` | `Service`, for `ctx.modelRegistry` |
| `@se373/schemastery` | config schema |
| `@se373/home-paths` | the default cache root under `$SE373_HOME` |
| `@se373/embedding` | `ArtifactDigest` and `EmbedRole` — the shared vocabulary of an identity |
| `@se373/invariants` | the boot-time companion that checks every declared row |

No HTTP client: acquisition uses `fetch` and `node:stream`.

## In / out

**In — config.**

| Field | Meaning |
|---|---|
| `root` | cache root; falls back to `$SE373_MODELS_ROOT`, then `$SE373_HOME/models` |
| `models` | extra `ModelRow[]`, merged over the shipped catalog by `id` |

The environment step exists because weights are large and are not anybody's
*data*: a run with a throwaway home should not mean a re-download, and two
checkouts on one machine should share one cache. Logs follow the home; weights
need not.

**Out — `ctx.modelRegistry`.**

| Method | Returns |
|---|---|
| `list()` | every declared row |
| `candidates(dims)` | rows whose `mrlDims` includes that width |
| `row(id?)` | one row, or throws naming every known id |
| `resolve(id?)` | `{ status: 'ready', dir, paths }` or `{ status: 'missing', missing, bytes, remedy }` |
| `acquire(id?, opts?)` | fetches what is missing, then re-resolves |
| `verify(id?)` | re-hashes every file; returns paths that did not match |
| `directory(id?)` / `bytes(id?)` | where it would live, how big it is |

**Out — on disk.** `<root>/<repo>/<revision>/<repository-relative path>`.

**Command line.** `pnpm models`, `pnpm models:acquire [id]`, `pnpm models:verify [id]`.

## Known Limitations and Deferred Work

- **`resolve` checks size, not content.** Hashing 300 MB on every boot would
  make the cheapest question in the system the slowest, so presence is a byte-length
  comparison against the pin — which catches the realistic failure, a truncated
  transfer — and full verification is the separate `verify` call. A file of
  exactly the right length with wrong bytes resolves as ready. There is
  deliberately no "verified" marker file: a marker would be a declared
  freshness flag, which is the thing this project refuses to trust.
- **Acquisition is not plan-gated yet.** The gate belongs to the caller, and
  today the only caller is a script a human ran. When `ctx.builder` exists
  (phase 6c) an approved plan becomes the second caller; I8 is satisfied by the
  invoker, not by this library.
- **Hugging Face is the only source.** URL construction is
  `huggingface.co/<repo>/resolve/<revision>/<file>`. A mirror or an air-gapped
  copy needs a second resolver, which does not exist.
- **No resume.** An interrupted transfer discards the `.partial` and starts that
  file again. Range requests are not used.
- **No eviction.** Nothing removes an old revision when a row is re-pinned; the
  previous directory stays until deleted by hand. That is deliberate for now —
  it is what lets an old generation keep being queryable — but it has no policy.
- **`models` config rows are typed but not schema-validated.** The useful check
  on a row is `describeIdentityFault` against the identity it produces, plus this
  package's invariant; a second partial schema would only drift from those.
