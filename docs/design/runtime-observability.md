# Design — Runtime Observability

> **Status:** design note, pre-implementation. Nothing here is built.
> Every decision is recorded with its reason, so it can be overturned by new
> information rather than by forgetting why. §9 lists what was considered and
> rejected, so those branches are not rewalked.

Two features that turn out to share one spine:

| | Answers |
|---|---|
| **The board** | what components exist right now, how they depend on each other, what each one is |
| **The app log** | what the process has been narrating — the boot sequence first, then everything after |

They are one feature because a log record carries the fiber that emitted it. A
line points at a node; a node filters the lines.

---

## 1. Facts this rests on

Verified against dsh at `47f94385`. Several of these overturned an earlier draft
of this document.

| Fact | Consequence |
|---|---|
| `AppFrame` has exactly four frame slots — `sidebar`, `conversation`, `details`, `shell.overlay` | there is no frame-level view ring to join |
| `conversation` is `kind: 'single'`, `scope: 'session-maybe'` | one occupant; an occupant without a session is legal |
| Shadowing in a single slot is by **priority** — *"ascending, default 0, lowest renders"*, same priority throws | registering at −1 renders over chat and leaves chat registered |
| `sidebar.footer.action` is `{ kind: 'list', scope: 'root' }` | the trigger needs no new slot |
| `details` is `scope: 'session'` | unavailable to a view with no session |
| Conversation drafts live in `inputHub.shell(sessionId)`, moved explicitly on session switch (`ui-conversation/src/client/apply.ts:219`) | unmounting chat does not lose the draft |
| `ui-primitives` ships `TerminalBlock` with a full ANSI model over `anser`, SGR runs mapped to theme tokens | the terminal renderer already exists, zero-cordis |
| `ui-primitives` ships `ReadBlock` (shiki, `{lines, totalLines, lang, maxLines}`) | a source renderer exists — but it is a component, not a fetch path |
| **`api/remotes` has no file-content Remote** | dsh never fetches source over the wire; source reaches the browser only as tool-result payload in the session log |
| `TrajectoryTable.tsx:2067` does `scrollIntoView({ behavior: 'smooth', block: 'center' })` | highlight-and-centre is already implemented upstream |
| Trajectory's inspector is a 13-member `DetailTab` union selected **per record kind**, with `RecordState = 'complete' \| 'running' \| 'error'` | the panel pattern to copy; `RecordState` maps onto fiber lifecycle |
| Trajectory rows are identified by session-log position; nothing upstream links a UI row to a runtime component | `fiberId` is ours to define — there is no precedent to follow |
| `internal/plugin(fiber)` fires on mount **and** disposal; `internal/status(fiber, oldState)` on every transition | the live feed exists; nothing to add upstream |
| `util/native-command` exports `runNativeCommand`; `open` is already used by `bundle/web-app`; `EDITOR`/`VISUAL` are in `app-boot`'s env allowlist | launching an editor needs no new primitive |
| **A fiber cannot cross the wire** — upstream states this; `cordis-host-runner` keeps a separate in-process `snapshot` for it | everything is flattened host-side |

---

## 2. The projection

### `ctx.runtimeGraph` is a core service, not a seam

Cardinality decides the mechanism (§5.1). One runtime, one loader tree, one
fiber tree — no second provider could exist, nothing is swappable. So it is a
core, like `ctx.sessions`.

That makes **I5 true by construction**: if the projection is the only way to
read the tree, the graph cannot drift from the runtime, because there is no
second source to drift from.

### The waterfall contributes only what cannot be derived

```
graph/node   [waterfall]   Node → Node
```

| Derived by the projection | Contributed by the waterfall |
|---|---|
| entry id, uid, realm, state, provides, injects, resolved config, structural kind | semantic role (`seam` / `provider` / `core` / `tool`), tier, display label |

This split is what keeps the waterfall genuinely **optional**: a package that
contributes nothing still gets a complete, useful node — it just shows as
untyped. That property matters on day one, when ~187 vendored packages will
contribute nothing and the board has to be useful anyway.

Inference would rot: every new package shape would need an edit to the observer,
and classification logic would end up knowing specific package names. The §6.1
block manifest already declares `seam`, `role`, and `tier` — a block should not
need a second classification system.

### "Type" is three axes, not one enum

Collapsing them loses the question people actually open the board to ask —
*is this a seam provider that is currently failed?*

| Axis | Source | Changes |
|---|---|---|
| Structural — row · group · include subtree | loader `Entry` | on config edit |
| Functional — provides a service · registers tools · listener-only | `fiber.store`, registry | never, after mount |
| Lifecycle — pending · loading · active · failed · unloading | `fiber.state` | constantly |

### Realm is carried from day one

`fiber.inject` yields a service *name*; resolving it to a provider is
realm-dependent (`ctx[symbols.isolate]`), and §6.3's A/B deliberately runs two
pipelines publishing the same name in different realms.

One opaque string on the node and one condition in edge resolution, now.
Retrofitting means changing the payload, the wire projection, the edge
algorithm, and every consumer — and **the failure mode until then is silent**:
the board draws one plausible edge for both pipelines and nobody notices until
the A/B demo.

### The payload must be complete

Every consumer renders a value and applies deltas; none holds state about the
system. The snapshot answers everything a click could ask — **if selecting a
node needs a round trip, the split is wrong.**

---

## 3. The seat

```
sidebar.footer.action   ← icon button (list, root scope)
        │ toggles
        ▼
conversation @ priority -1   ← our view renders
conversation @ priority  0   ← ui-conversation, shadowed but registered
```

Toggling is `ctx.effect` register/dispose. No vendored modification.

**Toggling unmounts the other view, and that is fine.** Conversation state lives
in session-keyed hubs outside React, and session switching already moves drafts
between them — so coming back re-binds to the same hub. Scroll position is the
only real casualty, and a streaming turn continues host-side regardless.

---

## 4. The view

**The graph is the view.** The log docks beneath it at ~30%, draggable to zero,
height persisted per viewer.

Not a tab ring. A node hangs in `PENDING` and the reason is a log line — you
need both at once, and tabs hide exactly the correlation that makes these one
system. It also matches the shape you already know reads well: Trajectory pins
an overview above a scrolling ledger.

### Readability at ~190 nodes

- **Grouped by package group** (`core`, `client`, `fs`…), collapsed by default;
  edges between collapsed groups aggregate. The port-surface map already proves
  this grouping reads at exactly this scale with exactly these items.
- **Seams-only is the default filter** — roughly 40 nodes, and it *is* §7.3's
  pipeline graph, arriving early. Toggle for everything.

### Disabled rows are shown, ghosted, with a count

The vendoring strategy rests on *"anything vendored but unwanted is
`disabled: true` in a config row"*. A large share of ~187 packages will be
disabled rows with an `Entry` and no fiber.

**You cannot turn on what you cannot see.** This is the board's strongest claim
to being a builder tool rather than a runtime viewer, and it maps onto §6.1's
tier vocabulary — a disabled row reads exactly like a `blocked` block: present,
inert, with an affordance.

### The animation is emergent, not scripted

A fiber waits in `PENDING` until its declared `inject` resolves. A node that
appears inert and springs live *when its dependency arrives* is dependency
resolution, rendered.

**No rate control, no trace replay.** Boot is ~200ms and the flicker is
intended: fast is the healthy case, and a node that visibly hangs is the signal.
A scripted animation would hide exactly that. Trace recording is therefore not
part of the projection — snapshot plus live deltas is the whole contract.

Do not fake a mount sequence either. A group starts its rows **concurrently**
(vendor modification #8, and the cause of the phase-1 logger race), so clusters
land at once. That concurrency is true and worth seeing.

### Snapshot-then-subscribe

More load-bearing than anything about the animation. A page opened after
startup, or reconnecting, missed every event. **Open the subscription before
taking the snapshot** so nothing falls in the gap; a late page then sees the
tree appear fully formed through the same code path, no special case.

### Layout is computed, not simulated

One flicker means one shot at settling — a spring layout that wobbles reads as
a glitch. Derive layers from real data (loader depth, or longest path over
`inject`), place nodes directly, spring only for changes once live. Pin settled
nodes.

The payoff is larger than it looks: deterministic layout makes boot graphs
**comparable across runs**. Two screenshots diff visually, and "the tree looks
different today" becomes a signal. A simulation gives a different hairball every
time and throws that away.

### Hot reload is an in-place update

`entryId` survives an HMR swap (upstream guarantees entry identity); `uid`
changes. So on `hmr/reload` the node **holds position, flashes, and gains a
"reloaded" transition** — it does not vanish and return.

A disappearing node reads as a crash, at the exact moment — authoring a block
in phase 6d and watching it swap in — when you most need to tell "it reloaded"
from "it died". Holding position also keeps the layout stable, preserving the
cross-run comparability above.

---

## 5. The app log

### dsh has no app log

Verified: every upstream package with "log" in its name is session-derived
(`session-log-export`, `session-stats`, `session-title`, `tool-todo`). No client
log viewer, nothing putting logger output on the wire. §11's Logger channel
lives and dies in the terminal.

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
  fiber?: WeakRef<Fiber>
}
```

`Logger` iterates registered exporters. `logger-console` is one. Ours are two
more — **no fork, no modification to anything vendored.**

| Package | Owns |
|---|---|
| `@se373/logger-remote` | ring buffer + wire projection |
| `@se373/logger-jsonl` | one file per run, keep newest N |

Independent `levels` per exporter, which `Exporter` already supports: a debug
firehose is fine in a terminal and expensive on disk. A headless boot runs the
file sink with no wire at all.

### One record, three destinations

`Message` is not serializable — `args` holds Errors, circular refs, sometimes
functions; `fiber` is a `WeakRef` that crosses nothing. The host formats once:

```
{ sn, ts, name, type, level, text, entryId, uid }
```

`text` is the ANSI-formatted line (what `logger-console` already produces, so
the browser is byte-identical to the terminal by construction). The rest stays
structured so filtering and node-linking never parse text.

**Serialization is shared; transport is not.** The same record goes to the ring,
the wire, and the JSONL sink.

### `fiberId` is `{ entryId, uid }`

Both, because they answer different questions and both are free.

- `entryId` — loader `entry.id`. Stable, human-readable, **survives an HMR
  swap**, so a line written before a reload still points at the right node.
- `uid` — `fiber.uid`. Distinguishes two live fibers of one entry, and makes
  "this came from the instance that just died" expressible.

### Rows

Structured gutter, `TerminalBlock` body:

```
+0.142s   vector-store   opened .se373/index.db
```

- **time relative to boot by default**, absolute clock on hover — Trajectory
  solves this exact tension with a 500ms hover; copy it
- **level as row colour**, not a text column — it is already colour in a terminal
- **package as a fixed-width truncating column**, clickable: it is the primary
  filter axis

### Filtering

Level threshold, package multi-select, plain substring. No regex — the classic
thing that gets built and used twice.

**Search must match against stripped text while rendering the ANSI.** Matching
the raw string means an SGR code between two letters silently breaks the match,
and that bug looks like the search is simply broken.

### Ring overflow is a visible boundary

Fixed line count — predictable for memory *and* for virtualized row heights.
Where the drop happened, the view shows **"N earlier lines — load from disk"**,
which is exactly where paging into JSONL hooks in.

A log that silently begins mid-stream is a log you cannot trust.

---

## 6. Selection and inspection

**Selection is shared and bidirectional.** Selecting in either view scrolls and
zooms the other to it. Clicking is a deliberate act, unlike scrolling past
something, so this does not fight you.

The inspector **replaces the log dock** while something is selected — not a
third split. Trajectory's pattern: a titled panel with a close control, tabs
chosen **per kind**, key/value rows.

| Selected | Tabs |
|---|---|
| Graph node | `Properties` · `Config` · `Injects` · `Timing` |
| Log line | `Message` · `Raw` |

`Properties` = the three axes, state, provides. `Config` = resolved config
against its schema. `Injects` = declared deps and who satisfies each **in the
live realm**. `Timing` = the transition list.

### Node transitions are the clickable records

A node carries its **lifecycle transitions** — bounded by definition (~2–4 per
entry, from `internal/status`), always present, costing nothing. There is **no
per-entry log tail**; log lines are fetched on demand.

Each transition is stamped `{ at, sn }` — the log's sequence watermark at
capture time. **`sn` is free to capture and impossible to reconstruct
afterwards**, which decides it: correlating by timestamp is ambiguous at boot
resolution, where several packages activate inside the same millisecond, and
that is precisely when this is used.

Clicking a transition **highlights the line and centres it**
(`scrollIntoView({ behavior: 'smooth', block: 'center' })`, as
`TrajectoryTable.tsx:2067` already does), and **clears the package filter** —
you clicked to see what was happening *around* that moment, and filtering to one
package hides the dependency that was resolving.

Because the transitions are always present, clicking a node never dead-ends:
you always see how it came up, even when its lines aged out of the ring.

### Source is an editor launch, not a tab

dsh has no file-content Remote — **source has never crossed the wire**. A Source
tab would mean building the first file-read path the client has ever had: a
resolver, a truncation policy, and a security boundary, all to duplicate what
`cmd-click` does for someone with the repo open.

Instead, "Open in editor" is an **action on the panel**:

- the client sends `entryId` — never a path, never a command, so path escaping
  is not a class of bug that exists here
- the host resolves the specifier the same way the loader did, then launches via
  `runNativeCommand`
- the command is a **config row** — `editor: 'code -g {path}:{line}'` —
  defaulting to OS `open`, which respects the user's file association. Changing
  your editor is a config-row edit, which is the pattern the project rests on.
- **capability-gated**: hidden or visibly inert unless an editor resolves *and*
  the host is the viewer's machine. `api/remotes` is a Remote BFF and the design
  contemplates remote hosts, where this would silently open a file on the
  server. Same `blocked`-tier treatment as any other unavailable capability
  (§6.1).

Model-authored blocks at phase 6d have **no file at all** — memory-only, gone on
restart — so they get a real Source tab then, reading from
`cordis-host-runner`'s registry with no filesystem involved.

---

## 7. Durability

`session-persistence-jsonl` splits into three layers; only the top is
session-shaped.

| Layer | Reuse |
|---|---|
| `index.ts` — implements `SessionPersistence`, typed on `SessionEvent` | ❌ wrong **type**, not wrong layer |
| `format.ts` — `logSuffix`, `encodeSegment`, `projectKey` generic; `sessionDir`, `logPath`, `eventLines` not | partial |
| `zstd.ts`, `win32.ts` — pure, know nothing about sessions | ✅ **directly** |

`win32.ts` is the Windows durability work (`koffi` → `MoveFileExW` with
write-through publication) and is exactly what not to rediscover. Import through
the `./src/*` export; record the deep import in `PORTING.md`, since a sync could
move the file.

**Copy the on-disk pattern, change the keying.** Theirs is
`<root>/--<normalized-cwd>--/<session>/`, kept forever. Ours is run-keyed and
capped. The retention policy *is* the difference between a session log and an
app log.

```yaml
- id: logger-jsonl
  name: '@se373/logger-jsonl'
  config:
    dir: .se373/logs
    maxRuns: 5
    compression: zstd        # 'none' drops the native dependency
    levels: { default: 2 }
```

`<ts>-<pid>.jsonl.zstd` sorts by name and is collision-free under concurrency.

**ANSI is stored, not stripped.** zstd erases the size argument — SGR codes are
the most repetitive bytes in the file — and `less -R` and `grep` handle them
fine, while recovering colour you discarded is impossible.

**A header line per file**, written at boot (`{ startedAt, pid, version, cwd }`),
following `session-persistence-jsonl`'s own `toHeaderLine`/`fromHeaderLine`
shape. The run picker reads only that line, so listing 5 runs is 5 small reads,
not 5 decompressions. Clean exit cannot be known at boot, so append a footer on
graceful shutdown and **treat its absence as crashed** — more useful than a flag.

**History reads decompress host-side** and stream plain records over the
existing wire; no zstd decoder ships to the browser.

### Three failure modes to handle, not discover

- **Pruning races live writers.** §10's MCP export spawns a harness subprocess
  per server, so processes coexist. Unlinking an open file is harmless on POSIX
  and **fails on Windows**. Prune at startup only, never touch the newest N by
  mtime, treat `EPERM`/`EBUSY` as skip-and-retry-next-boot rather than a boot
  failure. Vendor modification #14 is precedent for that retry shape.
- **A crash truncates the last line.** The reader must skip a trailing malformed
  record — otherwise the log from the crash under investigation is the one that
  will not open.
- **zstd costs a native dependency.** `compression: 'none'` is first-class in
  their design (`logSuffix` returns `.jsonl`), so the plain path has no native
  dep at all.

---

## 8. Consumers and phasing

```
ctx.runtimeGraph ──→ se373 inspect        terminal, phase 3
                 ──→ the board            browser, phase 4
                 ──→ model-facing tool    upstream's cordis_inspect already does this
                 ──→ §7.3 pipeline graph  phase 6c — this projection, filtered to seams

logger records   ──→ the app log view     browser, phase 4
                 ──→ <ts>-<pid>.jsonl     disk, phase 3
```

§7.3's pipeline graph is not a separate feature. It is the seams filter, which
is already the board's default view.

| Phase | |
|---|---|
| **3** | `ctx.runtimeGraph` + the `graph/node` waterfall · `logger-jsonl` · `se373 inspect` |
| **4** | wire projection · `logger-remote` · the board · the app log view |
| **6c** | pipeline graph (a filter) · promote shared components to §7.2's molecule catalog |
| **6d** | Source tab for model-authored blocks · HMR reload behaviour |

`se373 inspect` covers **the graph only**. The log record is nearly trivial and
`logger-console` already proves it renders; the graph payload is the one with
real risk — three axes, realm-aware edges, the completeness rule. A log CLI
would duplicate `tail -f`.

Writing the projection at phase 3 against a terminal renderer debugs the data
model before any canvas exists. **If `inspect` cannot answer a question in plain
text, the board will not either** — and finding that out costs a `console.log`,
not a React component.

---

## 9. Considered and rejected

Recorded so these branches are not rewalked.

| Rejected | Why |
|---|---|
| Vendor-modify `AppFrame` to add a frame-level view ring | unnecessary once priority-shadowing was understood |
| App-infra view as a `conversation.view` tab | session-scoped; boot is not |
| App-infra view in `shell.overlay` | semantically an overlay pretending to be a tab |
| Boot events as synthetic session events, to inherit Trajectory's renderer | would work, and would corrupt what I9 rests on — §11.1 keeps the session vocabulary free of operational records deliberately |
| Recorded boot trace replayed at a watchable rate | rate control hides the hanging node, which is the signal |
| Importing Trajectory's `TrajectoryTable`/`TrajectoryTimeline` | turn-aware, TTFT-aware, token-aware, session-sourced — a system log has none of those |
| A `Ledger` molecule built now | one consumer gets the props wrong; promote at 6c informed by a second use |
| Timing overview above the app log | app log is discrete events; the strip would be mostly empty. The overview belongs to boot, where the graph now sits |
| Per-entry log tail (50, then 20 lines) | superseded — the node's transition list is bounded, always present, and cheaper |
| Path-taking source Remote | the standard shape and the standard CVE; entry-taking removes the parameter entirely |
| Source tab reading from disk at phase 4 | no precedent in dsh, and duplicates an editor for the only audience that has one |
| `$EDITOR` as the launch default | usually a terminal editor; spawning vim from a web server does nothing visible |
| Auto-selecting the graph node when scrolling the log | fights the user; clicking is deliberate, scrolling is not |
| Hiding disabled rows | you cannot turn on what you cannot see |
| Regex log search | built once, used twice |

## 10. Known Limitations and Deferred Work

- **No mutation.** Nothing here enables, disables, or reloads a component from
  the board. Upstream's inventory declines this too (*"owns no … mutation
  path"*). Adding it means deciding whether the board writes config rows, which
  is a different feature with a different risk profile.
- **The ring is process memory**, and durability depends entirely on the JSONL
  sink being enabled. Correct per §11.1, but it means "why did last night's boot
  fail" has a prerequisite.
- **A node's transition list and the global ring can disagree** — transitions
  survive after their log lines age out. Correct, but the panel should make
  clear it is showing transitions, not lines, or it reads as invented history.
- **Ring size is unset.** A number for implementation time; the design only
  requires that overflow be visible.
- **Log-line `Source` has no call site.** `Message` carries none, so a log
  line's origin resolves to its *package*, not a line number.
