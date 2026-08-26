# Design — Runtime Observability

> **Status:** design note, pre-implementation. Nothing here is built.
> Decisions are recorded with their reasons so they can be overturned by new
> information rather than by forgetting why.

Two features that turn out to share one spine:

| | Answers |
|---|---|
| **The board** | what components exist right now, how they depend on each other, and what each one is |
| **The app log** | what the process has been narrating — boot sequence first, then everything after |

They are one feature because a log record already carries the fiber that
emitted it, so a line links to a node and a node filters the lines.

---

## 1. The projection

### `ctx.runtimeGraph` is a core service, not a seam

Cardinality decides the mechanism (§5.1). There is one runtime, one loader
tree, one fiber tree — no second provider could exist and nothing is swappable.
So it is a core, like `ctx.sessions`.

That also makes **I5 true by construction**: if the projection is the only way
to read the tree, the graph cannot drift from the runtime, because there is no
second source to drift from.

### Classification is a contribution, not an inference

The tempting design has the projection inspect each fiber and infer what kind
of thing it is. That is inference, and it rots: every new package shape needs an
edit to the observer.

Several contributors, ordered, each optional → **waterfall event** (§5.1):

```
graph/node   [waterfall]   Node → Node
```

A package declares its own role; the projection collects. Same shape as
`./invariant` companions, and the §6.1 block manifest already declares `seam`,
`role`, and `tier` — a block should not need a second classification system.

### "Type" is three axes, not one enum

They answer different questions and change at different rates. Collapsing them
loses the question people actually open the board to ask — *is this a seam
provider that is currently failed?*

| Axis | Source | Changes |
|---|---|---|
| Structural — row · group · include subtree | loader `Entry` | on config edit |
| Functional — provides a service · registers tools · listener-only | `fiber.store`, registry | never, after mount |
| Lifecycle — pending · loading · active · failed · unloading | `fiber.state` | constantly |

### The payload must be complete

Every consumer renders a value and applies deltas; none of them holds state
about the system. So the snapshot has to answer everything a click could ask —
**if selecting a node needs a round trip, the split is wrong.**

The one deliberate exception is source code: unbounded in size, rarely read, so
it is a separate call by design.

### Source events

Already emitted by Cordis; nothing to add upstream.

| Event | Carries |
|---|---|
| `internal/plugin(fiber)` | mount **and** disposal |
| `internal/status(fiber, oldState)` | every transition — keep `oldState`, the timeline needs it for spans |

**A fiber cannot cross the wire.** Upstream states this outright, and it is why
`cordis-host-runner` keeps a separate in-process `snapshot`. Everything is
flattened host-side.

---

## 2. The board

### Collect on every transition, not only success

A startup view exists to show what came up. Its most useful frame is a fiber
parked in `PENDING` because an injected service never arrived, or one that hit
`FAILED`. Recording only successes throws away the frame worth having.

### The animation is emergent, not scripted

A fiber waits in `PENDING` until its declared `inject` resolves. A node that
appears inert and springs live *when its dependency arrives* is dependency
resolution, rendered — the edge lighting up is the cause of the node activating.

**No rate control, no trace replay.** Boot is ~200ms and the flicker is
intended: fast is the healthy case, and a node that visibly hangs is the signal.
A scripted animation would hide exactly that. This drops trace recording from
the projection — snapshot plus live deltas is the whole contract.

Do not fake a mount sequence, either. A group starts its rows **concurrently**
(vendor modification #8, and the cause of the phase-1 logger race), so clusters
land at once. That concurrency is true and worth seeing.

### Snapshot-then-subscribe

More load-bearing than anything about the animation. A page opened after
startup, or reconnecting, missed every event. **Open the subscription before
taking the snapshot** so nothing falls in the gap; a late page then sees the
tree appear fully formed through the same code path, with no special case.

### Layout is computed, not simulated

One flicker means one shot at settling — a spring layout that wobbles reads as a
glitch. This is a layered DAG, so derive the layers from real data (loader
depth, or longest path over `inject`), place nodes directly, and use spring only
for changes once the tree is live. Pin settled nodes.

The payoff is larger than it looks: deterministic layout makes the boot graph
**comparable across runs**. Two screenshots diff visually, and "the tree looks
different today" becomes a signal. A simulation gives a different hairball every
time and throws that away.

### Edges lie under isolate realms

`fiber.inject` yields a service *name*; resolving it to a provider is
realm-dependent, and §6.3's A/B deliberately runs two pipelines publishing the
same name in different realms. A naive name→provider edge draws one of them for
both. **The projection must carry the realm**, or the board misrepresents the
exact feature it exists to show.

---

## 3. The app log

### dsh has no app log

Verified: every upstream package with "log" in its name is session-derived
(`session-log-export`, `session-stats`, `session-title`, `tool-todo`). There is
no client log viewer and nothing puts logger output on the wire. §11's Logger
channel lives and dies in the terminal.

### Cordis's exporter registry is the whole mechanism

```ts
interface Exporter { export(message: Message): void; levels?; formatters?; … }

interface Message {
  sn: number            // monotonic — gap detection on reconnect is free
  ts: number
  name: string          // package namespace — the filter axis, and §11.2's level axis
  type: 'error' | 'warn' | 'info' | 'debug'
  level: number
  args: any[]
  fiber?: WeakRef<Fiber>   // the link to a board node
}
```

`Logger` iterates registered exporters. `logger-console` is one. Ours are two
more — **no fork, no modification to anything vendored.**

### Two exporters, stacking

| Package | Owns |
|---|---|
| `@se373/logger-remote` | ring buffer + wire projection |
| `@se373/logger-jsonl` | one file per run, keep newest N |

Independent `levels` per exporter, which `Exporter` already supports. A debug
firehose is fine in a terminal and expensive on disk. A headless boot runs the
file sink with no wire at all.

```yaml
- id: logger-jsonl
  name: '@se373/logger-jsonl'
  config:
    dir: .se373/logs
    maxRuns: 5
    compression: zstd        # 'none' drops the native dependency
    levels: { default: 2 }
```

### `Message` is not serializable — one shared projection

`args` holds Errors, circular refs, sometimes functions; `fiber` is a `WeakRef`
that crosses nothing. Both exporters need the same `toRecord()`:

```
{ sn, ts, name, type, level, msg, fiberId? }
```

**Serialization is shared; transport is not.** `fiberId` is what links a log
line to a board node, so two implementations disagreeing about it would break
the feature that makes these one system.

### Boot events do not go in the session log

§11.1 is explicit: the session vocabulary *intentionally* has no operational
record, and operational facts belong on the live bus and in telemetry. Boot also
happens before any session exists. Making boot a synthetic session to inherit
Trajectory's renderer would work and would quietly corrupt what I9 rests on.

---

## 4. Durability — reuse the shape

`session-persistence-jsonl` splits into three layers, and only the top is
session-shaped.

| Layer | Reuse |
|---|---|
| `index.ts` — implements `SessionPersistence`, typed on `SessionEvent` | ❌ wrong type, not wrong layer |
| `format.ts` — `logSuffix`, `encodeSegment`, `projectKey` generic; `sessionDir`, `logPath`, `eventLines` not | partial |
| `zstd.ts`, `win32.ts` — pure, know nothing about sessions | ✅ **directly** |

`win32.ts` is the Windows durability work (`koffi` → `MoveFileExW` with
write-through publication) and is exactly the thing not to rediscover. Import
through the `./src/*` export and record the deep import in `PORTING.md`, since
a sync could move the file.

**Copy the on-disk pattern, change the keying.** Theirs is
`<root>/--<normalized-cwd>--/<session>/`, kept forever. Ours is run-keyed and
capped: `<root>/logs/<ts>-<pid>.jsonl.zstd`, newest `maxRuns`. Same durability
techniques; the retention policy *is* the difference between a session log and
an app log.

`<ts>-<pid>` sorts by name and is collision-free under concurrency, so "this run
vs previous runs" is a directory listing rather than an index file.

### Three failure modes to handle, not discover

- **Pruning races live writers.** §10's MCP export spawns a harness subprocess
  per server, so processes coexist. Unlinking an open file is harmless on POSIX
  and **fails on Windows**. Prune at startup only, never touch the newest N by
  mtime, treat `EPERM`/`EBUSY` as skip-and-retry-next-boot rather than a boot
  failure. Vendor modification #14 is precedent for that retry shape.
- **A crash truncates the last line.** The reader must skip a trailing
  malformed record — otherwise the log from the crash under investigation is the
  one that will not open.
- **zstd costs a native dependency.** `compression: 'none'` is first-class in
  their design (`logSuffix` returns `.jsonl`), so the plain path has no native
  dep at all. Compression matters more here than for sessions: a debug boot
  firehose is highly repetitive and compresses extremely well.

---

## 5. Coherence — a `Ledger` molecule

The app log should feel like Trajectory. That is a design-system question, and
§7.2 already owns the mechanism: ~8 composed molecules over `ui-primitives`,
with narrow props.

**Do not import Trajectory's components to get it.** They are more agent-coupled
than they look — turn-aware, thick rules on **Turn** boundaries, assistant spans
splitting **TTFT** from decoding, an inspector showing **token usage**, records
assembled from the Session window. A system log has no turns, no tokens, no
time-to-first-token.

What makes Trajectory feel like Trajectory is a **pattern**, and it is cheap to
restate:

- a fixed timing overview pinned above a scrolling ledger
- rows carry only index, event, content; everything else lives in the inspector
- selection opens a *local* inspector — not a modal, not a route
- drag an interval on the overview → the ledger filters to what was active in it
- wheel zooms the time domain, right-drag pans
- thick rules for major boundaries, compact markers for sub-units
- virtualized rows with semantic keys; opens at the tail, pages upward

None of that is agent-specific.

So: a `Ledger` molecule taking `{ id, at, duration?, kind, label, detail }` and
a render slot for the inspector body. Trajectory keeps its own implementation.
Our app log, boot view, and later views (ingest progress, eval runs, A/B) use
the molecule. They look alike because they share atoms and a pattern, **not a
data path.**

The bonus is real: §7.2 exists because model-authored UI runs in a fixed closure
with no imports, so it can only compose what we inject. Put `Ledger` in that
catalog and generated views inherit the same look — coherence extends to UI we
did not write, which is otherwise the part that looks visibly off.

---

## 6. Consumers

```
ctx.runtimeGraph ──→ se373 inspect        terminal, phase 3
                 ──→ the board            browser, phase 4
                 ──→ model-facing tool    upstream's cordis_inspect already does this
                 ──→ §7.3 pipeline graph  phase 6c — same data, filtered to seams

logger records   ──→ se373 inspect --log  terminal, phase 3
                 ──→ the app log view     browser, phase 4
                 ──→ <ts>-<pid>.jsonl     disk, phase 3
```

§7.3's pipeline graph is not a separate feature. It is this projection with a
filter.

## 7. Phasing

| Phase | |
|---|---|
| **3** | `ctx.runtimeGraph` + the `graph/node` waterfall · `logger-jsonl` · `se373 inspect` as the dumb consumer |
| **4** | wire projection · `logger-remote` · the board · the app log view · the `Ledger` molecule |
| **6c** | the pipeline graph, as a filtered view of the same projection |

Writing the projection at phase 3 against a terminal renderer debugs the data
model before any canvas exists. **If `inspect` cannot answer a question in plain
text, the board will not be able to either** — and finding that out costs a
`console.log`, not a React component.

## Open questions

- [ ] Where does the app-log view live — a `conversation.view` tab beside
      Trajectory, or outside the conversation shell, given that boot is not
      conversation-scoped?
- [ ] Is the timing overview part of the `Ledger` pattern or an optional prop?
      A boot sequence wants it; a general app log is mostly discrete events and
      would render a mostly-empty strip.
- [ ] Exact node payload — decided when the projection is written, constrained
      by §1's completeness rule.
- [ ] Ring buffer size, and whether the live view pages backward into previous
      runs from disk through the same record shape.

## Known Limitations and Deferred Work

- The app log is **not durable across a crash beyond the last flush**, and the
  ring is process memory. That is correct per §11.1, but it means "why did last
  night's boot fail" depends entirely on the JSONL sink being enabled.
- Nothing here addresses *mutation* — no enable/disable/reload from the board.
  Upstream's inventory declines that too ("owns no … mutation path"). Adding it
  later means deciding whether the board writes config rows, which is a
  different feature with a different risk profile.
