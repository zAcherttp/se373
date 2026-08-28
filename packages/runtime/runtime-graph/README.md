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

Each node also carries its **isolation realm**, from day one, even though
nothing reads it yet. `fiber.inject` yields a service *name*; which
implementation that name reaches is realm-dependent, and the A/B design
deliberately runs two pipelines publishing the same name in different realms.
Retrofitting the field later would mean changing the payload, the wire
projection, the edge algorithm and every consumer — and until then the failure
mode is silent: one plausible edge drawn for two different pipelines, unnoticed
until the A/B demo.

## Depends on

| | Why |
|---|---|
| `ctx.loader` (injected) | the entry tree is the only source of configured rows, including the ones with no fiber |
| `@se373/cordis` | `Fiber`, `Context`, `Inject.resolve`, and the reflect store the live service index is read from |
| `@se373/invariants` (peer, `./invariant` only) | the completeness check; the ordinary entrypoint stays free of diagnostics |

Nothing is injected beyond the loader. The reflect store, the fiber states and
the effect labels are all read directly off the context that is already in hand.

## In / out

**Config in** — none. The projection has nothing to configure; narrowing is a
per-call argument, not a deployment choice.

**Service out** — `ctx.runtimeGraph`:

| Member | Returns |
|---|---|
| `snapshot(query?)` | `RuntimeGraphSnapshot` — `{ capturedAt, nodes, totalNodes }` |
| `node(entryId)` | one `RuntimeGraphNode`, or `undefined` |

`RuntimeGraphQuery` narrows by `entryId` (that row and everything beneath it),
by `lifecycle`, and by `enabled`. Narrowing happens *after* projection, so
`totalNodes` always reports the real size of the tree — a narrowed report that
cannot say what it left out reads as a complete one.

**Node payload** — `entryId`, `parentEntryId`, `moduleName`, `uid`, `realm`, the
three axes, `enabled`, `mounted`, `provides`, `injects`, `unresolvedInjects`,
and `config` sanitized to JSON. The payload is deliberately complete: selecting
a node must not require a second call to answer what a click could ask.
`unresolvedInjects` is in that set because it is the answer to "why is this
pending", which is the single most common reason to look.

**Events emitted** — none. The snapshot is point-in-time: no subscription, no
polling loop, no history. A live transport is decision D9, taken when the board
needs one.

## Known Limitations and Deferred Work

- **Point-in-time only.** No subscription and no deltas. A consumer that wants
  to watch the tree must poll, and will miss transitions between polls.
- **No `graph/node` waterfall yet.** Semantic role, tier and display label —
  the fields a package would contribute about itself — are not collected. Every
  node is complete but untyped; that is issue #2.
- **No edges.** Dependency edges, and the realm-aware resolution they need, are
  also issue #2. `injects` and `provides` carry the raw material; nothing joins
  them yet.
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
