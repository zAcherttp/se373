# @se373/logger-jsonl

## What it does

Makes "why did last night's boot fail" a question with an answer.

Every run of the harness leaves a durable, run-keyed log on disk. Upstream has
no app log at all — every dsh package with "log" in its name is *session*-derived
(`session-log-export`, `session-stats`, `session-title`, `tool-todo`), and the
Cordis logger channel lives and dies in the terminal. This is that gap.

It closes it the way Cordis intends: `LoggerService` iterates registered
`Exporter`s, `logger-console` is one, and this is a second — **no fork, and no
modification to anything vendored**. It carries its own level threshold, because
a debug firehose is fine in a terminal and expensive on disk, and a headless
boot may want the file sink with no console at all.

Three decisions worth knowing before reading the code:

- **ANSI is stored, not stripped.** Compression erases the size argument
  entirely — the escape codes are the most repetitive bytes in the file —
  `less -R` and `grep` handle them, and colour you discarded is unrecoverable.
- **The absence of a footer is how a crash is identified.** Clean exit cannot be
  known at boot, so a footer is appended on graceful shutdown and its absence is
  read as crashed. That is more useful than a flag a crashing process never gets
  to write.
- **The boot backlog is adopted.** Cordis's `LoggerService` keeps its own ring of
  recent messages, registered by the root before any config row exists. This
  package drains it when its file opens, so a failure in a row that mounts
  *earlier* still reaches the file — which is most of what an app log is for.
  The ring captures at INFO, whatever this sink's threshold says, so a `debug`
  line from before this row mounted is already gone. Errors and warnings, which
  is what a post-mortem is looking for, are all above that line.

## Depends on

| | Why |
|---|---|
| `ctx.logger` | the exporter registry; the whole mechanism, and nothing here extends it |
| `@se373/session-persistence-jsonl` (deep, `./src/*`) | `logSuffix`, the Zstandard frame helpers, and the Windows durable-namespace publication. See below |
| `@se373/home-paths` | resolves the default directory to `$SE373_HOME/logs` |
| `ctx.loader` (opportunistic, via `ctx.get`) | `locate(fiber)` maps a message's emitting fiber to the row that owns it. Read rather than injected, so the sink still works on a context with no loader |
| `@se373/schemastery` | the config schema |
| `@se373/invariants` (peer, `./invariant` only) | checks the live artifact is still on disk |

**The durability primitives are reused, not reimplemented.** `win32.ts` in
particular is the `koffi` → `MoveFileExW(MOVEFILE_WRITE_THROUGH)` work, which is
the single most expensive thing in the vendored tree to rediscover. Only the
session-shaped top layer of that package is left alone — it is typed on
`SessionEvent`, which is the wrong *type*, not the wrong layer. The deep imports
are recorded in [`docs/PORTING.md`](../../../docs/PORTING.md), because a sync
could move those files.

## In / out

**Config in**

```yaml
- id: logger-jsonl
  name: '@se373/logger-jsonl'
  config:
    dir: !!js dshHomePath('logs')   # default: $SE373_HOME/logs
    maxRuns: 5                      # includes the run being created
    compression: zstd               # 'none' takes the compression path off entirely
    levels:
      default: 2                    # this sink's own threshold, not the console's
```

**Service out** — `ctx.loggerJsonl`, whose only member of interest is `path`:
where this run is being written. It exists so a later consumer — the phase-4 log
view paging past the end of its in-memory ring — can ask, rather than
reconstruct the filename convention.

**On disk** — `<UTC stamp>-<pid>.jsonl[.zstd]`, sorting by name and collision-free
across concurrent processes (harness subprocesses coexist with the main one).

| Line | Shape |
|---|---|
| header, first | `{ type: 'run', version, startedAt, pid, cwd }` |
| record | `{ sn, ts, name, type, level, text, entryId?, uid? }` |
| footer, last | `{ type: 'run-end', endedAt, records }` |

`text` is the formatted message body with its ANSI intact; everything else stays
structured, so filtering and node-linking never parse text. Node identity is
recorded as **both** ids because they answer different questions and both are
free: `entryId` survives a hot reload, so a line written before a swap still
points at the right node, and `uid` distinguishes two live instances of one
entry.

**Reader out** — `readRunLog(path)`, `listRuns(dir)`, `pruneRuns(dir, keep)`,
`parseRunLog(text)`. `listRuns` reads only the header line (or, compressed, only
the first frame), so listing five runs is five small reads rather than five
decompressions — which is the entire reason the header is its own line.

**Events emitted** — none.

## Known Limitations and Deferred Work

- **Records are batched, so a `kill -9` loses up to 200ms of narration.** One
  Zstandard frame per log line would spend more bytes on frame headers than on
  text, so batching is not optional. Verified: a killed run's partial log opens
  and reports `crashed: true`.
- **`compression: 'none'` changes the write path, not the import graph.** The
  frame helpers are imported at module load either way. That costs nothing:
  Zstandard here is `node:zlib`, a Node built-in with no native dependency at
  all. The one native dependency in the reused set is `koffi`, and `win32.ts`
  already loads it lazily inside the Windows publication path, so it is never
  loaded off Windows under either setting.
- **A failed write is reported once, on the console, and then swallowed.**
  Records in that batch are lost. The alternative — rejecting out of the flush
  timer, or out of the fiber's disposer — would turn a failed log line into an
  unhandled rejection or a failed tree unload. The write queue is explicitly
  built to survive one bad write rather than to stop at it, because a poisoned
  queue would drop the footer too and make a clean shutdown read as a crash.
- **Appends are not fsynced; the header and the footer are.** A batch lives in
  the OS page cache until the kernel flushes it, so a *machine* crash can lose
  more than the buffer. A process kill cannot. Per-batch `fsync` was rejected as
  a boot-time cost paid on every line for a failure mode this package does not
  claim to survive.
- **Lines emitted after this row unloads are lost.** The row is inside the tree,
  so tree teardown disposes it and whatever the remaining rows log on their way
  out has no sink. Moving the sink to the root — the way `apps/cli` mounts
  `logger-console` — would fix it and would cost the config row, which is the
  wrong trade for I3.
- **Pruning is best-effort and startup-only.** A locked or busy file is skipped
  and retried next boot, never a boot failure. It also means a directory shared
  with several live processes can exceed `maxRuns` until one of them restarts.
- **`maxRuns` counts artifacts, not bytes.** Five runs of a long session are
  five long files; there is no size cap.
- **No rotation within a run.** One process, one file, however long it lives.
- **No `Source` for a log line.** Cordis's `Message` carries no call site, so a
  line's origin resolves to its *package*, not to a line number.
- **The reader loads the whole file.** Fine at these sizes; a paging reader is
  phase-4 work, when the log view needs "N earlier lines — load from disk".
