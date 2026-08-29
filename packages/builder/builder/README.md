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

## Known Limitations and Deferred Work

- **No intent parsing.** `intent` is recorded on the spec and never read. A
  request without a recipe and without an explicit block list resolves to zero
  rows — there is no model in this loop yet, and "intent → blocks" is the part a
  model would do.
- **The preset is recorded and not applied.** `spec.preset` names an agent
  preset; fabrication mounts rows and does not join a session to it, so a
  fabricated agent is a live subsystem rather than a conversational agent. The
  design's `agent-presets` + `subagent-spawn-in-process` path is not wired.
- **No workspace sandbox.** The design confines a fabricated agent to a
  `workspaceRoot`; nothing here does, so a fabricated `tool-fs` row would see
  whatever the parent process sees.
- **No diff.** I4 promises a version diff renders as a config diff; two spec
  versions are stored and nothing compares them.
- **Plans accumulate in memory** keyed by digest, and are never evicted.
- **Fabrication is not transactional.** The loader creates the group and its
  children; a child that fails to import leaves the rest mounted, reported only
  on the graph.
