# Builder plane — recipes, blocks, and evolution

**Status:** settled 2026-08-27, in a design interview covering 32 decisions.
Nothing here is built. This document is what the build follows.

Its job is to answer one question the architecture doc leaves open: *what,
exactly, does the builder build, and what does the user hold while it does?*

---

## 1. The claim, stated so it can be checked

The system does not ship an agent. It ships **the pieces an agent is made of**,
a builder that composes them, and a way to watch that happen while it runs.

Three properties, in the order a user meets them:

| | |
|---|---|
| **Inspectable** | Every piece is visible, with a badge saying who wrote it |
| **Composable** | A working agent is an arrangement of pieces, not a program |
| **Continuous** | Arrangements change while the system runs, and nothing restarts |

The third is what makes this different from a code generator. A generator hands
you a file. This hands you a running subsystem and then keeps changing it.

---

## 2. `ctx.blocks` is a repository, not a catalog

The distinction matters more than it sounds.

A **catalog** is read-only and populated at mount from whatever is vendored.
A **repository** has a write path, versions, parentage, and a namespace for
entries that did not come from the vendor.

We build the repository from day one, and the deciding argument is provenance:
the moment a block carries `origin`, entries can come from somewhere other than
the vendor, and a catalog cannot express that. Retrofitting a write path into a
catalog is a rewrite of the registry; starting with a repository that happens to
be full of system-authored entries costs almost nothing.

### The record

```ts
interface Block {
  id: BlockId
  kind: 'agent' | 'ui' | 'pipeline' | 'recipe'
  origin: 'system' | 'agent' | 'user'
  version: number
  forkedFrom?: BlockId          // present iff this block was derived
  conformance?: SeamId          // the suite it must pass before mounting
}
```

**One registry, keyed by `kind`.** The reason to keep it single is that
"compare two retrieval pipelines" and "compare two agents" then differ only in
which blocks the rows name — the comparison machinery is written once.

**`origin` is a field, not a badge.** The badge in the inspector is a
projection of it, the same way the graph is a projection of the runtime. What
the field actually does is gate policy:

| `origin` | Mounts |
|---|---|
| `system` | directly — it shipped with the harness |
| `user` | directly — a human wrote it and is accountable for it |
| `agent` | only after passing its seam's conformance suite (I7) |

---

## 3. Recipes — the cookbook

A **recipe** is a click-to-prefill starting point: not just prompt text, but
the model, the thinking effort, and whatever else is configurable, chosen by us
for the best result. Clicking one loads all of it into the chat, ready to send
or edit.

Six ship, one per SE373 archetype. They are `kind: 'recipe'`, `origin: 'system'`
blocks — which means **forking a recipe is the same gesture as forking any other
block**. A user who wants their own starter needs no new mechanism, no new UI,
and no new file location, and their fork shows up in the same cookbook with a
different badge.

### Shape, and why it is only prose today

A recipe carries a description of the system it builds, not a specification of
it. Two builds of one recipe may compose differently. That is intended: it is
what makes the v1-vs-v2 comparison in §5 interesting rather than a formality.

The bound on that variance is a **conformance suite**, and a suite needs a seam
to conform to. `ctx.embedder` and `ctx.vectorStore` do not exist until phase 6a,
so the internal-knowledge recipe grows a suite **when its seams do**. Recipes
ship as prose first, not as a compromise but because there is nothing yet for
them to be checked against.

---

## 4. What the builder authors

Two rungs, and both are real capabilities rather than a staged rollout:

**Composition.** The builder arranges existing blocks into a row list. Nothing
is written that did not already exist. This satisfies I1 trivially and is
deterministic enough to perform live.

**Authoring.** The builder writes a new block — a fork of an existing one, or a
new provider behind an existing seam — which mounts only after its suite passes.

*Staging is demo choreography, not build order.* Composition is what gets
performed on stage because it is reliable; authoring is what gets recorded. Both
get built, and phase 6d stops being the thing that gets cut when the semester
slips.

### The fabricated agent

A built agent is **a live Cordis subtree** over a sandboxed workspace root:
`agent-presets` for isolate-realm enforcement, `subagent-spawn-in-process` to
run it, `sandbox-policy`'s `workspaceRoot` to confine it. Three consequences,
and the third is why it is worth doing this way:

1. I6 means the whole subtree unwinds with one disposer, so a failed
   fabrication leaves no wreckage — which is what makes a live attempt safe.
2. `agent-presets` already owns the hard part of realm enforcement.
3. I5 means a fabricated subtree **appears on the graph by itself.** There is no
   "show the new agent" feature to write; the projection already shows it.

---

## 5. Evolution — generations, not mutations

"Build the rough version, then improve it, add features, improve the pipeline,
connect more external things."

Evolution operates on **the emitted config value, not the running tree.** v1 is
a named, versioned value (I4); evolution produces v2, builds it *alongside*,
flips, and drops v1 — the same generation mechanism already settled for index
rebuilds and write-side A/B.

Two things follow, and both are load-bearing:

- **You cannot compare against a version you mutated away.** The side-by-side
  preview of v1's answer against v2's is only possible because v1 is still there.
- **A bad evolution is survivable.** v2 fails its suite, never flips, v1 keeps
  serving.

The board renders this as it happens — the new generation building beside the
old, then the flip — but rendering is where the "mutate in place" model belongs,
not mechanism.

### Every generation is plan-gated

I8, and it is not overhead: the plan is the demo beat, and `plan-mode` is
already a base row. Plan and suite do different jobs — **the plan is what the
human approves; the suite is what the system verifies.**

Gating only destructive changes was considered and rejected: it requires the
model to classify the blast radius of its own change, which is the precise
judgment I8 exists to not trust.

### The three rungs

Evolution is not one capability. It is a ladder, and it matters that the bottom
rung is nearly free:

| Rung | The ask | What it costs | Risk |
|---|---|---|---|
| 1 | "connect it to this MCP server" | **one config row** | none — no authoring, no install, no conformance |
| 2 | "build me an internal knowledge agent" | compose blocks from a recipe | near-deterministic |
| 3 | "make it work with Milvus" | fork a block, gated install, conformance, hot-swap | the ambitious one |

Without rung 1 the ladder starts at the rung that can fail on camera. This is
why `mcp-client` lands early as a `disabled: true` row rather than waiting for
the export phase: an agent that gained a tool while running, visible on the
board, with nothing restarted, is a genuine demonstration of the whole claim and
it costs one package.

---

## 6. Forks

**Per-workspace, not per-session** (closes D7). The evolution loop is explicitly
multi-session work — build rough, come back, improve. Per-session forks mean the
second conversation cannot see what the first built, and the v1-vs-v2 comparison
does not survive a restart, which matters if you are recording it.

### Forks may install dependencies (closes D8)

Reversing the cautious answer, because the motivating case is the strongest
demo in the project: the builder forks `ctx.vectorStore` to add a Milvus
backend, and **proves it satisfies the contract before mounting it, using a
suite it cannot edit.**

Three boundaries make that survivable, and all three reuse decisions made
elsewhere:

| Constraint | Where it comes from |
|---|---|
| The dependency request appears **in the plan the human approves** | §5's plan gate — no install is a surprise |
| Install lands in the **fork namespace, with its own lockfile** | this section — the root lockfile is never touched |
| Order is **install → conformance → move in → HMR** | the staging rule; a failed install returns as a tool result and repair is a normal loop iteration |

---

## 7. Conformance suites

A contract test that lives **next to the seam definition, not next to the
provider**. The provider cannot edit it, because I1 says the model authors
implementations and never seam contracts, and the suite is part of the contract.

```ts
export const chunkerConformance: Conformance<Chunker> = {
  seam: 'chunker',
  checks: [
    { name: 'deterministic', async run(c) {
        expectEqual(await c.chunk(SAMPLE, OPTS), await c.chunk(SAMPLE, OPTS),
          'identical input must produce identical chunks')
      } },
    { name: 'no content loss', async run(c) {
        expectContains(join(await c.chunk(SAMPLE, OPTS)), SAMPLE,
          'every byte of input must survive chunking')
      } },
    { name: 'respects size bounds', async run(c) { /* … */ } },
    { name: 'disposal releases handles', async run(c) { /* … */ } },
  ],
}
```

Four properties distinguish it from an ordinary test file:

- **It tests through the seam's interface only**, never internals — so a
  vendored provider, a fork, and a model-authored one are checkable by the same
  suite, unchanged.
- **It runs before mount**, in the order syntax check → typecheck → conformance
  → mount. A failure returns to the model as an ordinary tool result, so repair
  is a loop iteration rather than an error state.
- **It checks that something *is* a provider, not that it is a *good* one.**
  "Does this reranker permute rather than invent?" is conformance. "Does it rank
  well?" is the eval. Conflating them makes the gate slow and wrong.
- **It pairs with invariants rather than duplicating them** — conformance runs
  once before mount, invariants run continuously. A fork can pass conformance
  and still leak store handles across reloads; only the live check catches that.

---

## 8. Knowledge plane bindings

Closes D3 and D4, decided together because dimensionality fixes the store
schema.

**Store: `sqlite-vec`**, loaded through `node:sqlite`'s `DatabaseSync` with
`allowExtension` — verified available on Node 24.19. This reuses the exact
pattern `storage-sqlite` already uses upstream, needs no native build of our
own, and puts one generation in one file, so "build alongside, flip, drop" is a
file swap. LanceDB was rejected: a native module and a directory format, whose
advantage is a scale this project will not reach.

**Embedder: pin the dimensionality, not the model.** At **384**,
`all-MiniLM-L6-v2`, `bge-small-en-v1.5`, `gte-small` and `multilingual-e5-small`
are interchangeable, so the model is a config row (I3) and the index fingerprint
— `hash(source, chunker, embedder+dims, storeSchema)` — catches staleness on a
swap without anyone declaring anything.

**Default multilingual.** The course material is Vietnamese and the golden
question set is over our own mixed-language docs; an English-only default never
exercises the choice.

---

## Known Limitations and Deferred Work

- **None of this is built.** The nearest work is `ctx.runtimeGraph`, which this
  document assumes exists and which does not.
- **The block record above is a sketch.** `BlockId` shape, version ordering, and
  how `forkedFrom` interacts with the generation flip are unspecified.
- **`ctx.builder` is not designed at all** — this document covers what it
  operates on, not how it decides.
- **The install path (§6) is described, not designed.** Which package manager,
  where the fork's `node_modules` lives, and how a failed install is rolled back
  are open.
- **Recipe variance is unbounded until 6a.** Between now and the first
  conformance suite, "we try to keep the shape" is a claim about prompt quality
  with nothing checking it.
- **Rung 1 assumes an MCP server exists to connect to.** Nothing in this project
  provides one until phase 7, so the early demo depends on a third-party server.
- **Evaluation is out of scope here** and is its own phase. Conformance says a
  provider is a provider; nothing yet says a pipeline is good.
