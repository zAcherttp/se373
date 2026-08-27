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
- **Testing is not a priority until the web plane.** The user's call. Two specs exist (the invariants registry, the phase-2 spine) and they stay; do not add more before phase 4.
- **We do not port.** The one port we wrote (`invariants`) was retired at the first opportunity for the vendored original — it was faithful and still dropped a load-bearing thenable. `docs/PORTING.md` §4.
- **The upstream tree is 238 packages, not ~50.** The old figure counted directories under `packages/`. 150 are off our path.

## Upstream reference

- Local clone: `../deepseek-harness` — currently at `47f94385` (Aug 13). **The plan was written against `b150a55` (v0.1.1-rc.2, Aug 21).** Update the clone or expect small drift.
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

1. **Start phase 4** (web plane) — the risk spike. 18 of 40 upstream client
   packages, no one to parallelise with, and it is what turns approval's `ask`
   from a hang into a prompt.
2. ~~Name the project~~ — settled: `@se373/*`.
3. ~~Write `docs/PORTING.md`~~ — done.
4. **Get the milestone dates and grading breakdown.** The announcement in `docs/COURSE.md` has neither, so the phase plan carries no deadline pressure and "are we on track" is unanswerable.
5. ~~Write a block-authoring guide for teammates~~ — no teammates. The audience is the model authoring blocks at phase 6d, so this becomes the `graph/node` and block-manifest contract, not onboarding prose.
6. ~~Start phase 1~~ — shipped, tagged `phase-1`.
7. ~~Start phase 2~~ — shipped, tagged `phase-2`. 31 packages vendored; the
   harness answers a task headlessly.
8. ~~Start phase 3~~ — shipped, tagged `phase-3`. 59 vendored; it reads,
   searches, runs commands, and edits.

## Risks being tracked

- **Phase 4 (web plane) is the risk spike, and solo makes it worse.** 18 of 40 upstream client packages, and no one to parallelise with. If the semester slips, it slips there. Plan the demo so it survives phase 4 landing late — the headless path (phases 2–3) plus the MCP export (phase 7) is a complete story with no browser in it.
- Model-authored UI is a demo cliff — keep a deterministic fallback for anything shown live.
- **Solo changes the scope calculus, not the schedule.** Prefer 2 archetypes that work reliably over 6 that are flaky, and cut breadth before cutting depth — the thesis is the builder, and one archetype it genuinely emits proves it better than six half-built ones.
- dsh is a developer preview with an unstable API; Cordis advertises the same.

## Working with me on this

Be concise. Lead with the result. No essays, no restating the question, no narrating steps. Tables over prose for anything comparative. Push back with specifics when a design has a hole — that has been the useful mode throughout.
