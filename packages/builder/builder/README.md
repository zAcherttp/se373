# @se373/builder

## What it does

`ctx.builder`: intent becomes a resolved agent, and only then a running one.

Three separate acts, deliberately not one:

1. **Resolve.** A recipe or a block list becomes an `AgentSpec` — a named,
   versioned value (I4), registered in `ctx.blocks` like anything else. Nothing
   runs; nothing is written outside the repository.
2. **Approve.** The spec is digested and proposed to `ctx.planGate`. Nothing is
   fabricated before a human said yes to *that digest* (I8).
3. **Fabricate.** The spec becomes a live Cordis subtree through the loader, so
   it appears on the runtime graph by itself (I5) and unwinds with one disposer
   (I6). There is no "show the new agent" feature to write, and a failed
   fabrication leaves no wreckage — which is what makes attempting one live a
   reasonable thing to do.

**The model authors implementations, never seam contracts (I1).** Everything
here composes existing blocks: the builder chooses *which* rows and *what
config*, and cannot invent a seam. Authoring a provider behind an existing seam
is phase 6d, and it arrives as a block with `origin: 'agent'` that the repository
already refuses to mount until its suite passes.

**Resolution never throws.** Every failure becomes a warning, because a plan
that cannot be produced is a plan nobody can look at, and the point of a plan
card is to show what is about to happen *including* the parts that will not.
Warnings cover four cases: an unknown block, a block that names no plugin, a
block the mount policy refuses, and a row whose injections nothing satisfies —
that last one mounts `pending` and never starts, which is legible on the graph
*afterwards* and invisible in a plan.

**Blocked-tier blocks become disabled rows, not omitted ones.** I2 says
connecting an external system *upgrades* an agent and never *enables* it, and a
row you cannot see is a row you cannot turn on.

## Depends on

| | |
|---|---|
| `ctx.blocks` | injected; where specs are registered and blocks resolved |
| `ctx.loader` | injected; how a spec becomes rows |
| `ctx.planGate` | read opportunistically — with no gate mounted, `planId` is `null` and fabrication proceeds |
| `@se373/digest` | the spec digest an approval binds to |
| `@se373/runtime-graph` | `contributeNode` |

## In / out

**In.** `plan({ recipe?, intent?, name?, blocks? })`.

**Out.** A `BuildPlan`: `planId`, `digest`, `spec`, `specRef` (`id@version`), and
`warnings`. Then `fabricate(digest)` → a `FabricatedAgent` with its loader
`entryId`; `list()`; `dismantle(entryId)`.

An `AgentSpec` carries `name`, `version`, `recipe`, `preset`, `prompt`, `rows`
and `isolates`. `isolates` is §6.3's collision guard applied at build time
rather than discovered at demo time: the spec isolates exactly the **seams** its
blocks provide, so two fabrications coexist, and isolates *only* those, so leaf
resources deliberately shared stay shared.

**Out — events.** `builder/planned`, `builder/fabricated`, `builder/dismantled`.

Dismantling removes the subtree and leaves the spec in the repository:
dismantling a running agent is not the same as forgetting how it was built.

## The conversational half (6d step 2)

A spec now splits into **subsystem rows** (the plane, mounted in the subtree)
and **agent rows** (the model-facing composition). Agent rows are not mounted by
the builder at all: they are written — with the recipe's persona and, when
filesystem tools are composed, a sandbox realm — into a generated preset
directory inside the agent's own scaffold, and the subtree mounts its **own**
`agent-presets` row over that directory with `agentPresets` (and `settings`)
isolated. That isolation is what keeps the fabricated persona out of the main
picker, and it is why `presetsOf(entryId)` exists: the root context cannot see
the roster, so session-creating callers reach it through the row's own fiber.

A session then joins the way the gateway's do:

```ts
const presets = ctx.builder.presetsOf(agent.entryId)
await ctx.agents.create({ ..., setup: agentCtx => presets.mount(agentCtx, agent.presetId) })
```

**One correction to the plan of record**: the design named
`subagent-spawn-in-process` as the runner, but a spawned child `composeFrom`s
its *parent's* composition — it structurally cannot join a different preset. So
fabricated agents converse as their own sessions, created the gateway's way;
the spawn machinery remains what it was, delegation *from* an agent.

`workspaceRoot` is caller-supplied, defaults to a fresh `workspace/` inside the
scaffold, is resolved at **plan** time so it is inside the digest a human
approves, and appears on the plan card — pointing write-capable tools at a
caller-supplied tree is the one step on the card flagged destructive.

## Known Limitations and Deferred Work

- **No intent parsing.** `intent` is recorded on the spec and never read. A
  request without a recipe and without an explicit block list resolves to zero
  rows — there is no model in this loop yet, and "intent → blocks" is the part a
  model would do.
- **No diff.** I4 promises a version diff renders as a config diff; two spec
  versions are stored and nothing compares them.
- **Plans accumulate in memory** keyed by digest, and are never evicted.
- **Fabrication is not transactional past the scaffold.** The scaffold is
  removed when the mount throws, but a child row that fails to import leaves its
  siblings mounted, reported only on the graph.
- **The scaffold is not removed on dismantle.** Deliberate — the preset and
  workspace are the durable record of what ran — but nothing prunes them ever.
- **`presetsOf` returns `unknown`.** Typing it would put `@se373/agent-presets`
  in the builder's dependency graph for one return type; callers cast.
