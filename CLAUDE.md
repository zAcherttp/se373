# SE373 — Agentic Builder

## What this is

A meta-agent that **builds agents**. Course project for SE373 (Kỹ thuật xây dựng hệ thống Agentic AI, UIT, Semester 1 2026-27, Wednesday mornings). Project-based, graded on a complete Agentic AI system.

**Worked solo** — one person plus Claude. ⚠️ The course announcement says students work **in groups** (`làm việc theo nhóm`), so solo is an assumption, not a permission. Confirm it in week 1; if groups are mandatory, the scope below is the thing to cut, not the schedule.

The course's own thesis is **Agent = Model + Harness** — the Harness is what makes an agent a system rather than a chatbot. It names six archetypes (Coding, Code Review, Requirement Analysis, Internal Knowledge, Multi-Agent Workflow, MCP Assistant). **We are not submitting one of them — we are submitting the thing that emits them.** Not a harness that does A; a harness for which A is a subsystem it can build, inspect, improve, and export.

The eight topic areas we are judged against, and how our phases cover them, are in `docs/COURSE.md`. All eight are covered — taking dsh's baseline bundle is what covers them; that is the reason to build on dsh rather than beside it.

**The full technical plan is [docs/agentic-builder-architecture.md](docs/agentic-builder-architecture.md).** Read it before proposing architecture changes. Also published at https://claude.ai/code/artifact/c5820d42-f5d3-44e4-a7ef-38860cbba49f

## Approach

Built **on Cordis**, taking DeepSeek Harness as the vendored baseline and adding the two planes it lacks. Every phase ends with something that runs, and every vendored package gets documented rather than rewritten — that is how understanding is bought back without paying for a rewrite.

Every phase ends with something that **runs**. Slice vertically, never ship a layer with nothing above it.

## The nine invariants

| # | Invariant |
|---|---|
| I1 | The model authors **implementations**, never **seam contracts** |
| I2 | A generated agent is **alive on arrival** (ready / defaulted / blocked tiers) |
| I3 | Swapping a stage is a **config-row edit**, never a code edit |
| I4 | A pipeline is a **named, versioned value** |
| I5 | The graph is **derived from the live runtime** |
| I6 | Every registration is a **reversible effect** |
| I7 | Authored code mounts only after passing its **seam conformance suite** |
| I8 | Building is **plan-gated** |
| I9 | Every failure is **attributable and logged** |

## Decisions already settled — do not relitigate without new information

- **Cordis is L0, a dependency.** Rewriting it would consume the semester.
- **Seam vs waterfall is decided by cardinality.** Pick-one → seam. Stack-many → waterfall event.
- **`ctx.embedder` is on the critical path and has no upstream analogue** — dsh ships chat adapters only. Default to a local ONNX embedder: no API key, no router, preserves I2.
- **Index staleness is a computed fingerprint, not a declared flag.** A model-authored block can misstate a boolean; it cannot forge `hash(source, chunker, embedder+dims, storeSchema)`.
- **Destructive changes build a new generation alongside, flip, then drop.** This single mechanism gives zero-downtime rebuild, index rollback, and write-side A/B.
- **A/B isolates the pipeline composition, shares the store.** Isolating the store would compare indexes, not pipelines.
- **Hot reload is solved upstream** (`@cordisjs/plugin-hmr`, a `dsh-base` row). We build the staging gate around it, not the reload itself.
- **UI uses dsh `ui-primitives`, not Base UI.** Already styled, zero-cordis (so injectable into the sandbox closure), and native-looking. dsh has no third-party UI library at all.
- **MCP export is codegen over the SDK's stdio transport** — no port, no sandbox involvement, lowest-risk deliverable. Bank it early.
- **dsh has no app log.** Its Logger channel never leaves the terminal. Ours is two Cordis exporters — a ring buffer over the wire and a run-keyed JSONL sink — reusing `session-persistence-jsonl`'s durability primitives but not its seam. `docs/design/runtime-observability.md`.
- **The runtime graph is one projection with many renderers.** `ctx.runtimeGraph` is a core service; the terminal inspector, the board, the model tool, and §7.3's pipeline graph are all consumers of it. That is what makes I5 true by construction.
- **dsh's baseline is our baseline.** On-path upstream packages are vendored, not rewritten, and the selector is dsh's own bundles rather than a hand-picked list: 187 of 227 taken. `docs/PORTING.md` §2.
- **Vendoring is a script, not a chore.** `scripts/vendor-dsh.mjs` walks the closure from a seed, rescopes, repoints manifests at source, regenerates tsconfigs, and re-applies our divergences from one `LOCAL_MODS` table. Widening the vendored set is a seed-list edit. `docs/PORTING.md` §3.
- **Our user-data root is `~/.se373`, never `~/.dsh`, and our child-process env prefix is `SE373_`, never `DSH_`.** Logged local modifications 6–8. The `dshHomePath` *key* keeps upstream's name so dsh patch YAML transplants verbatim; only the value is ours.
### Settled 2026-08-27 — the design interview

32 decisions, nine rounds. `docs/design/builder-plane.md` carries the reasoning;
architecture doc §13 and §14 carry the consequences.

- **The deliverable is chat → plan → fabricate**, recorded first with a live fabrication as the encore. Pace is ours; there is no external deadline, and phases are the reproducible checkpoints.
- **`ctx.blocks` is a repository, not a catalog** — write path, versions, parentage, from day one. `origin: system | agent | user` is a *field* that gates policy (an agent-authored block mounts only after conformance), and the inspector's badge is a projection of it.
- **One registry keyed by `kind`**: `agent | ui | pipeline | recipe`. A fabricated UI is a row list over UI blocks, never authored JSX — so "compare two pipelines" and "compare two agents" differ only in which blocks the rows name.
- **A recipe is click-to-prefill**: prompt, model, thinking effort, and whatever else is configurable, shipped by us. Six ship as `origin: system` blocks, so forking one is the same gesture as forking anything else.
- **Evolution produces generations, never mutations.** v2 builds alongside v1, passes its suite, flips. You cannot compare against a version you mutated away, and a failed evolution leaves v1 serving.
- **Everything is plan-gated (I8), including evolution.** The plan is what the human approves; the suite is what the system verifies. Gating only destructive changes was rejected — it asks the model to classify its own blast radius.
- **A fabricated agent is a live Cordis subtree** over a sandboxed `workspaceRoot`, via `agent-presets` and `subagent-spawn-in-process`. I5 then means it appears on the graph by itself; there is no "show the new agent" feature to write.
- **The evolution ladder has three rungs**, and the bottom one must exist: add an MCP row (free), compose from a recipe (near-deterministic), fork a block with a gated install (the ambitious one). `mcp-client` lands at phase 3.5 for exactly this reason — one package.
- **Forks are per-workspace and may install dependencies**, plan-gated, inside their own lockfile, in the order install → conformance → move in → HMR.
- **6d is not the cut candidate.** Authoring is the claim. Staging composition ahead of it is demo choreography, not build order.
- **Phase 4 takes `bundle/web-app` whole** — 78 packages, 60 → 138 — plus dsh's chat roster and our board as a row in their layout. Replacing the `root` slot is unproven ground upstream; do not. **The browser cannot run from source**: budget the build pipeline as a workstream.
- **`ctx.runtimeGraph` comes before the web plane** (phase 3.5), with the `graph_inspect` tool as its first consumer rather than a view.
- **Knowledge plane: `sqlite-vec` over `node:sqlite`, 384 dims, multilingual by default.** Pin the dimensionality, not the model — then the model is a config row and the fingerprint catches the swap.
- **Sync policy: neither freeze nor track.** Update the clone when something looks worth having, read the breaking changes, re-run the vendoring script for the affected seeds, read the diff.
- **Divergence policy:** small mechanical edits go in `LOCAL_MODS`; anything additive is our own package plugging into the vendored seam; never fork a vendored package into `packages/`.

- **Testing is not a priority until the web plane.** The user's call. Two specs exist (the invariants registry, the phase-2 spine) and they stay; do not add more before phase 4.
- **We do not port.** The one port we wrote (`invariants`) was retired at the first opportunity for the vendored original — it was faithful and still dropped a load-bearing thenable. `docs/PORTING.md` §4.
- **The upstream tree is 238 packages, not ~50.** The old figure counted directories under `packages/`. 150 are off our path.

## Upstream reference

- Local clone: `../deepseek-harness` — at `b150a551` (v0.1.1-rc.2), which is the rev the plan was written against. No drift. Provenance is stamped per package in `se373.upstream`, not tracked in prose; `docs/PORTING.md` §1 records why that changed.
- License: MIT. Copied files keep the upstream notice; `docs/PORTING.md` records per-file provenance.
- Cordis: **source-vendored under `vendor/`**, rescoped to `@se373/*`. Taken from dsh's patched copy, not npm — the npm packages carry the same version numbers with different content, minus the fiber-disposal and HMR fixes that I6 and phase 6d rest on. `docs/PORTING.md` has the detail.

## Working rules

### Vendor and document; do not rewrite

When something upstream already does the job, **vendor it and document it** —
what it does, what it depends on, and the shape of the data in and out. This
applies to the whole on-path set, not just to `vendor/`. A rewrite needs a
reason recorded in `docs/PORTING.md`; so far there is exactly one
(`@se373/invariants`).

**Take dsh's bundles.** `bundle/base` is upstream's own answer to "what does a
working harness need" — which is precisely what SE373 calls the Harness.
Curating our own subset re-decides, worse, a question already answered.
`base + headless + web-app` plus 13 unreachable extras is 187 of 227 packages.

**Anything we do not want running is a `disabled: true` row, not an exclusion.**
That is invariant I3: one line, reversible when a demo needs it. The 40
genuinely excluded packages all need external infrastructure or another
vendor's protocol — e2b, ACP, LSP, PTY, third-party search keys.

Documentation lives with the code: every package gets a `README.md` covering

| Section | Content |
|---|---|
| What it does | one paragraph, in terms of the problem, not the implementation |
| Depends on | services injected, packages imported, and why each is needed |
| In / out | the data shapes crossing the boundary — config in, service surface out, events emitted |
| Known Limitations and Deferred Work | required; an omitted section reads as a completeness claim |

### Maintain the feature log

`docs/FEATURE-LOG.md` is **append-only**. Never edit or delete an entry; if
something turns out wrong, append a new entry saying so.

Every time a phase ends with something that runs:

1. Tag it — `git tag -a phase-N -m "..."`. The tag is the rewind point.
2. Append an entry using the format at the top of that file.
3. The entry's `Demonstrable` command must actually run at that tag.

This is what makes `git checkout phase-2` show phase 2 working. A phase that
ends with nothing runnable gets no tag and no entry — that is the check, not a
formality.

## Immediate next steps

1. **Start phase 6a** (the embedding seam) — `ctx.embedder` over a local ONNX
   model and `sqlite-vec` at 384 dims. It is the first phase where the thing
   being built has no upstream analogue at all, so the vendor-and-document rule
   stops carrying the work.
2. **Re-read the testing decision.** "Not a priority until the web plane" was
   the standing call; the web plane arrived two phases ago. Two specs is thin
   for 150 vendored packages, a four-stage build, a browser and a preset plane —
   and phase 6 is where we start writing code with no upstream to check it.
3. ~~Name the project~~ — settled: `@se373/*`.
4. ~~Write `docs/PORTING.md`~~ — done.
5. ~~Get the milestone dates~~ — **dropped 2026-08-27.** The user's call: phases are what we can go back to and reproduce, and otherwise we go at our own pace. Still worth confirming in week 1 whether solo is permitted.
6. ~~Write a block-authoring guide for teammates~~ — no teammates. The audience is the model authoring blocks at phase 6d, so this becomes the `graph/node` and block-manifest contract, not onboarding prose.
7. ~~Start phase 1~~ — shipped, tagged `phase-1`.
8. ~~Start phase 2~~ — shipped, tagged `phase-2`. 31 packages vendored; the
   harness answers a task headlessly.
9. ~~Start phase 3~~ — shipped, tagged `phase-3`. 59 vendored; it reads,
   searches, runs commands, and edits.
10. ~~Start phase 3.5~~ — shipped, tagged `phase-3.5`. 60 vendored plus our
    first three own packages. The agent inspects its own runtime, every run
    leaves a durable log, and `mcp-client` sits there disabled. D10 closed.
11. ~~Start phase 4~~ — shipped, tagged `phase-4`. 146 vendored, a four-stage
    build, 44 browser bundles, and a real turn driven through it by hand. D9
    deferred rather than closed.
12. ~~Start phase 5~~ — shipped, tagged `phase-5`. 150 vendored; the agent plane
    moved behind a shipped preset roster, and a subagent runs.

## Risks being tracked

- ~~**Phase 4 is the risk spike**~~, ~~**the vendor build already fails**~~, ~~**nothing has been driven by a human yet**~~ — **all three retired 2026-08-28.** Phase 4 shipped; the vendor build exits `0` on upstream's own tsconfigs; a real turn has been driven through the browser by hand. What the phase actually taught is worth keeping: the hard parts were configuration the upstream tree had already solved, and the fix each time was to vendor upstream's answer rather than derive our own.
- **The build is now load-bearing and has no test.** Four stages plus Vite, and a break in any of them is a browser that does not boot. Nothing checks it but running it.
- ~~**The web tree diverges from upstream's patch in one place**~~ — **closed 2026-08-28.** The model-facing rows are behind presets now, exactly as upstream's patch has them.
- **Testing has outlived its deferral twice.** Two specs cover 150 vendored packages, a four-stage build, a browser and a preset plane. Phase 6 is where we begin writing code with no upstream implementation to check it against, which is the first time the absence will actually cost something.
- Model-authored UI is a demo cliff — keep a deterministic fallback for anything shown live.
- **Solo changes the scope calculus, not the schedule.** Six *recipes* ship and the block vocabulary must span all six, but only two archetypes get built out — the generality is the claim, the demos are evidence for it. Cut breadth before depth.
- **D9 is what this design opened, and it is now smaller than it was.** The runtime graph still has no push transport upstream (`pluginInventory.list()` is poll-only), but node transitions are recorded as they happen rather than sampled, so a polling board is a latency compromise and not a lossy one. ~~D10~~ closed 2026-08-28: the third-party MCP path works, no fallback server needed.
- dsh is a developer preview with an unstable API; Cordis advertises the same.

## Working with me on this

Be concise. Lead with the result. No essays, no restating the question, no narrating steps. Tables over prose for anything comparative. Push back with specifics when a design has a hole — that has been the useful mode throughout.
