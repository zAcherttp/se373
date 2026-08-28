# @se373/runtime-graph

## What it does

Answers "what is running inside this process, and why is that component not?" —
as data rather than as log archaeology.

The harness is a tree of configured rows, most of which are inert by design: the
vendoring strategy says anything vendored but unwanted is a `disabled: true`
row, not an exclusion, so a large share of the tree has a config entry and no
running instance at all. This package projects **every** row — running, waiting,
failed, and disabled alike — into one flat snapshot. You cannot turn on what you
cannot see, and that is what makes this a builder's instrument rather than a
runtime viewer.

`ctx.runtimeGraph` is a **core service, not a seam**. Cardinality decides:
there is one runtime, one loader tree, one fiber tree, so no second provider
could exist and nothing here is swappable. That is also how invariant I5 — *the
graph is derived from the live runtime* — becomes true by construction rather
than by discipline: if this is the only way to read the tree, the graph cannot
drift from the runtime, because there is no second source for it to drift from.

Each node carries **three independent axes** rather than one collapsed "type",
because collapsing them loses the question the graph is opened to ask — *is this
a seam provider that is currently failed?*

| Axis | Values | Changes |
|---|---|---|
| Structural | `row` · `group` · `include` | on a config edit |
| Functional | `provider` · `tools` · `listener`, `null` until mounted | never, after mount |
| Lifecycle | `pending` · `loading` · `active` · `failed` · `unloading` · `null` | constantly |

Each node also carries its **isolation realm**, and its dependency **edges are
resolved in that realm**. `fiber.inject` yields a service *name*; which
implementation that name reaches is realm-dependent, and the A/B design
deliberately runs two pipelines publishing the same name in different realms. An
edge computed by name alone would draw one plausible edge for both and nothing
would report the error. `examples/realm-split/` is that case, built to fail if
the realm is ever dropped: two consumers, one service name, two providers, and a
script that exits non-zero unless the two edges are distinct.

An **unsatisfied** injection is reported as unsatisfied, never omitted — a node
hanging on a missing dependency is the main thing this gets read for, and a node
that silently drops the edge looks fully wired.

A **fourth, contributed axis** hangs off the `graph/node` waterfall: semantic
role (`seam` · `provider` · `core` · `tool`), tier, and a display label. Nothing
structural is contributable — see *In / out* — and the contribution is genuinely
optional: a package that says nothing still gets a complete node, just an
untyped one. That property is load-bearing, because ~190 vendored rows say
nothing and the graph still has to be worth reading.

Finally, each node carries its **lifecycle transitions**: the state changes its
root fiber actually went through, observed from the runtime's own status event
rather than sampled. They are bounded by definition and cost nothing to keep, so
clicking a node never dead-ends — you can see how a component came up long after
its log lines have aged out of memory. Each is stamped with the log's sequence
watermark, which is free to capture at the moment of the change and impossible
to reconstruct afterwards; at boot several packages activate inside the same
millisecond, so a timestamp alone cannot tell you which log line went with which
transition, and boot is exactly when you are asking.

## Depends on

| | Why |
|---|---|
| `ctx.loader` (injected) | the entry tree is the only source of configured rows, including the ones with no fiber |
| `@se373/cordis` | `Fiber`, `Context`, `Inject.resolve`, and the reflect store the live service index is read from |
| `ctx.logger` (read, not injected) | `_snMessage`, the sequence watermark stamped on each transition. Read rather than injected because a context with no logger should still record *when* things happened |
| `@se373/invariants` (peer, `./invariant` only) | the completeness and edge-coverage checks; the ordinary entrypoint stays free of diagnostics |

Nothing is injected beyond the loader. The reflect store, the fiber states and
the effect labels are all read directly off the context that is already in hand.

## In / out

**Config in** — none. The projection has nothing to configure; narrowing is a
per-call argument, not a deployment choice.

**Service out** — `ctx.runtimeGraph`:

| Member | Returns |
|---|---|
| `snapshot(query?)` | `RuntimeGraphSnapshot` — `{ capturedAt, nodes, totalNodes }` |

`RuntimeGraphQuery` narrows by `entryId` (that row and everything beneath it),
by `lifecycle`, by `enabled`, and by `role` (`null` selects the untyped rows).
Narrowing happens *after* projection, so `totalNodes` always reports the real
size of the tree — a narrowed report that cannot say what it left out reads as a
complete one.

**Node payload** — `entryId`, `parentEntryId`, `moduleName`, `uid`, `realm`, the
three derived axes, `enabled`, `mounted`, `provides`, `injects`,
`unresolvedInjects`, `edges`, `transitions`, the contributed `role` / `tier` /
`label`, and `config` sanitized to JSON. The payload is deliberately complete:
selecting a node must not require a second call to answer what a click could ask.

`unresolvedInjects` and an unsatisfied `edges` entry answer **different**
questions, and legitimately disagree:

| | Question |
|---|---|
| `unresolvedInjects` | what has *this fiber* not resolved — the live reason it sits in `pending` |
| an unsatisfied edge | what does *this realm* not provide — true for a row that never mounted at all |

An unmounted row has resolved nothing, so everything is in `unresolvedInjects`
while its realm may already hold perfectly good providers. For a mounted row the
two agree.

**Contribution in** — the `graph/node` waterfall, or `contributeNode(ctx, …)`,
which is the same thing with the node-matching written for you:

```ts
import { contributeNode } from '@se373/runtime-graph'
contributeNode(ctx, { role: 'core', tier: 'L2', label: 'Runtime graph' })
```

Only `role`, `tier` and `label` survive. The projection re-applies every derived
field afterwards, so a listener **cannot** restate what a node is, only what it
means — that is enforced by picking the three fields out of the waterfall's
result rather than by asking listeners to behave.

**Events emitted** — `graph/node` (waterfall), once per node per snapshot. The
snapshot itself is point-in-time: no subscription, no deltas. A live transport
is decision D9, taken when the board needs one. Transitions are the one piece of
*history* the projection keeps, and they exist precisely because the snapshot
has none.

## Known Limitations and Deferred Work

- **Point-in-time only.** No subscription and no deltas; a consumer that wants
  to watch the tree must poll. What a poller misses is *node identity and state*
  between samples — the transition list is the exception, because it is recorded
  as it happens rather than sampled, and a poll therefore recovers the history
  it slept through even though it missed the moment.
- **Almost every row is untyped, and the seam filter is thin because of it.**
  Only our own packages contribute to `graph/node`; the ~190 vendored rows
  contribute nothing, so filtering to `role: seam` today returns far fewer rows
  than the tree actually contains seams. Annotating a vendored package would
  mean editing it, which the porting rules forbid and the next sync would
  overwrite — so the honest fix is our own packages, as they arrive.
- **Transitions begin when this row mounts, not when the process starts.**
  `internal/status` is a live event with no backlog, so a row that came up
  before `runtime-graph` has no recorded history. The row is placed near the top
  of the config for that reason. This is the same boundary the app log has, and
  it cannot be closed from inside a config row.
- **A row that is born pending and never moves has no transitions.** Cordis
  emits `internal/status` on a *change*; the initial state is not one. So a node
  stuck waiting for a dependency shows an empty history, and its unsatisfied
  edge is what explains it.
- **Transitions are capped at 32 per row.** A clean boot produces two or three;
  the cap exists for hot reload, which re-runs the sequence on every save. Past
  the cap the oldest are dropped.
- **The watermark is a log *position*, not a log line.** It says how many
  messages the logger had emitted when the transition happened. Records below a
  sink's threshold never reach that sink's file, so the nearest record at or
  before the watermark is the correlation, not an exact match — and a sink that
  reopened its file mid-run restarts its own file at a higher `sn` than it
  contains.
- **A disabled row's realm and edges are approximate.** The isolate map is
  swapped onto an entry's context as part of *starting* it, so a row that never
  started reports the realm it would inherit, not the one its own `isolate:`
  block asks for. Enabling the row corrects both.
- **An edge names the provider, not the injection site.** A row that injects a
  service and passes it to three children shows one edge, at the row.
- **Functional axis is `null` before mount, and can under-report after it.** It
  is derived from the live service store and from the entry fiber's own effect
  labels. A plugin that registers its tools from a *grandchild* fiber reads as
  `listener`. Services are attributed correctly at any depth; tools are not.
- **No failure reason.** A `failed` node says that it failed, not why. Cordis
  keeps the startup error private to the fiber and offers no accessor; the
  reason is in the log, which is what `@se373/logger-jsonl` is for.
- **No mutation.** Nothing here enables, disables or reloads a component.
  Upstream's inventory declines this too. Adding it means deciding whether the
  graph writes config rows, which is a different feature with a different risk
  profile.
- **Disabled rows report little.** A row whose module was never imported has no
  plugin object to read, so `provides` is empty and `functional` is `null` —
  absence of evidence, and the projection does not pretend otherwise.
- **Config is sanitized, not faithful.** A `!!js` expression that resolved to a
  function reads as `"[Function]"`; cycles read as `"[Circular]"`; nesting is
  cut at 12 levels.
