# @se373/vs-sqlite-vec

## What it does

Fills `ctx.vectorStore` with SQLite. **One generation is one file**, plus a
manifest holding exactly one fact: which generation queries go to.

That layout is what makes the settled destructive-change mechanism cheap. A
rebuild is a second file, a flip is one line, a drop is `unlink`, and a rollback
is a flip back. Sharing one database between generations would make each of
those a transaction against data being read concurrently.

No native build is involved: `node:sqlite` ships with Node, and `sqlite-vec`
ships prebuilt platform binaries loaded through
`DatabaseSync(path, { allowExtension: true })`.

## Depends on

| | |
|---|---|
| `node:sqlite` | `DatabaseSync`, with extension loading. Node 22.5+; still flagged experimental |
| `sqlite-vec` | the `vec0` virtual table, via `getLoadablePath()` |
| `@se373/vector-store` | the abstract base and `assertComparable` |
| `@se373/embedding` | `EmbedderIdentity`, `EmbedResult` |
| `@se373/home-paths`, `@se373/cordis`, `@se373/schemastery` | paths, service, config |

## In / out

**In — config.** `dir` — where the manifest and generation files live; defaults
to `$SE373_HOME/vectors`.

**Out — on disk.**

```
<dir>/manifest.json        { "active": "<generation id>" | null }
<dir>/gen-<id>.db          one generation
```

Each generation file holds three tables:

| Table | Holds |
|---|---|
| `meta` | fingerprint, dims, modelId, status, createdAt |
| `records` | `id`, `key` (unique), `text`, `metadata` |
| `vectors` | `vec0(embedding float[dims])`, keyed by `records.id` |

`dims` is fixed at creation because a `vec0` table declares its width in DDL —
which is the physical reason dimensionality belongs to a generation rather than
to the project.

**Out — behaviour worth knowing.** `upsert` runs in one transaction, because a
partially written batch is a generation whose record and vector counts disagree
and nothing downstream would notice. Replacing an existing key is delete-then-
insert, since `vec0` has no upsert. KNN is expressed as `... match ? and k = ?`
rather than `limit ?`: `vec0` needs the neighbour count as a constraint on its
own scan, and a `limit` outside a join is not one.

## Known Limitations and Deferred Work

- **`node:sqlite` is experimental.** Every process using this prints an
  `ExperimentalWarning`, and the API may change under a Node upgrade. Nothing
  here pins or suppresses it.
- **Every generation file stays open once touched.** `list()` opens each to read
  its metadata and caches the handle until the row unloads. With many
  generations that is many file descriptors; there is no LRU.
- **Metadata is stored, never queried.** It round-trips as a JSON string.
  Filtering by it means a schema change.
- **No index tuning.** `vec0` is used with its defaults — brute-force scan, no
  quantization or partitioning. Fine at demo scale; unmeasured beyond it.
- **A corrupt manifest reads as "no active generation".** That is the safe
  failure, and it is silent: the generation files are all intact and
  re-activating one is a single call, but nothing reports that it happened.
- **Writes are not concurrency-safe across processes.** WAL is on, so readers
  do not block, but two processes writing one generation are not coordinated.
