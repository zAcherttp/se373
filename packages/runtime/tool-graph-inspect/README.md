# @se373/tool-graph-inspect

## What it does

Hands the model the `graph_inspect` tool, so the agent can ask what is running
inside its own process and get a structured answer back.

It is the first consumer of `ctx.runtimeGraph`, and it exists before any view
does on purpose. Writing the projection against a text renderer debugs the data
model early: **if `graph_inspect` cannot answer a question in plain text, the
phase-4 board will not answer it either** — and finding that out costs a tool
call rather than a React component.

It is a separate package from the service because they are different kinds of
decision. The service is infrastructure every later consumer needs; giving the
model a tool is a deployment choice, and I3 says a deployment choice is a config
row you can disable, not an import you have to delete.

## Depends on

| | Why |
|---|---|
| `ctx.tools` (injected) | the registry the tool registers into, with its canonical `output` declaration |
| `ctx.runtimeGraph` (injected) | the projection; this package owns no runtime knowledge of its own |
| `ctx.systemPrompt` (injected) | one guidance line telling the model when the tool is worth calling |
| `@se373/invariants` (peer, `./invariant` only) | checks the tool is actually visible while the plugin is active |

## In / out

**Config in** — none.

**Tool out** — `graph_inspect`, read-only and concurrency-safe.

| Parameter | Effect |
|---|---|
| `entry_id` | keep only that row and everything beneath it |
| `lifecycle` | keep only these phases; `none` selects rows with no live instance |
| `enabled` | keep only rows that are, or are not, effectively enabled |
| `role` | keep only these contributed roles; `untyped` selects rows that contribute nothing |

An unknown `entry_id` is an error naming the remedy, not an empty report — an
empty report reads as "nothing is running there", which is a different and wrong
answer.

**Canonical value out** — the snapshot verbatim: `{ capturedAt, totalNodes,
nodes[] }`, with every node field declared in the output schema. `totalNodes`
travels with every narrowed report so the model can tell how much it did not ask
for.

**Rendered content** — two shapes, chosen by result size rather than by a flag.
A single matching row renders as a full detail block: its axes, its contributed
semantics, one line per dependency naming who satisfies it, its lifecycle
transitions, and its resolved config. A multi-row result renders as a table plus
two derived sections — injections nothing satisfies in the requesting row's own
realm, and rows resolving in a non-root realm. A model surveying 190 rows does
not want 190 configs; a model that asked about one component does.

The transition list is **labelled as transitions on every rendering**, not just
in the schema. A node's history and the log can legitimately disagree — the log
is level-filtered and its ring overflows, the transitions are neither — and an
unlabelled list of timestamped state changes sitting next to a log reads as
invented history. Each line carries `sn`, the log sequence watermark, which is
what makes "what else was happening at that moment" answerable.

## Known Limitations and Deferred Work

- **Read-only, permanently.** The tool cannot enable, disable or reload
  anything. That is a property of the projection beneath it, not a gap here.
- **No pagination.** A very wide unnarrowed report is truncated by the tool
  registry's own spill policy rather than by this package. The description
  steers the model toward narrowing; nothing enforces it.
- **The table omits config.** Only the single-row detail block renders config,
  so a model surveying many rows has to ask again for a specific one. The
  canonical value carries every config either way, so a programmatic consumer
  loses nothing.
- **The `role` filter is thin.** It works, but almost nothing contributes a role
  yet: the vendored rows say nothing, so `role: ['seam']` is not the useful
  default view it is meant to become.
- **Transitions are rendered in full, uncapped by the renderer.** The projection
  caps them at 32 per row, so a detail block for a row that has been hot-reloaded
  all afternoon is long. Narrowing is by row, not by transition.
- **Inherits every limitation of the projection**, including no failure reason
  on a `failed` row and no history from before the graph row mounted. See
  [`@se373/runtime-graph`](../runtime-graph/README.md).
