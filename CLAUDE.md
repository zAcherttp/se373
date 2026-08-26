# SE373 — Agentic Builder

## What this is

A meta-agent that **builds agents**. Course project for SE373 (Kỹ thuật xây dựng hệ thống Agentic AI, UIT, Semester 1 2026-27, Wednesday mornings). Team, project-based, graded on a complete Agentic AI system.

The course's own thesis is **Agent = Model + Harness** — the Harness is what makes an agent a system rather than a chatbot. It names six archetypes (Coding, Code Review, Requirement Analysis, Internal Knowledge, Multi-Agent Workflow, MCP Assistant). **We are not submitting one of them — we are submitting the thing that emits them.** Not a harness that does A; a harness for which A is a subsystem it can build, inspect, improve, and export.

The eight topic areas we are judged against, and how our phases cover them, are in `docs/COURSE.md`. **Three gaps are open there** — Memory/Context Management, Agent Skills, and Security.

**The full technical plan is [docs/agentic-builder-architecture.md](docs/agentic-builder-architecture.md).** Read it before proposing architecture changes. Also published at https://claude.ai/code/artifact/c5820d42-f5d3-44e4-a7ef-38860cbba49f

## Approach

Built **from scratch on Cordis**, porting DeepSeek Harness piece by piece in working phases — deliberately, so the team understands the system rather than inheriting it. Cordis itself is a dependency and is never ported.

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
- **On-path upstream packages are vendored, not rewritten** (settled 2026-08-26). Hard-dependency closure is 89 packages once our own bundles replace `bundle/*`. See `docs/PORTING.md` §2.
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

**Write our own bundles.** `bundle/base`, `bundle/headless`, and
`bundle/web-app` are profile manifests that declare every row in a profile as a
dependency, so vendoring them drags in 84 packages we do not want — typert,
compaction, goal, workflow, spill, and the whole client tail. Vendoring
everything else gives a hard-dependency closure of 89 packages instead of 173.
The bundle is a row list; we write ours.

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

1. **Start phase 2** (agent spine). Nothing blocks it.
2. ~~Name the project~~ — settled: `@se373/*`.
3. ~~Write `docs/PORTING.md`~~ — done.
4. **Close the three coverage gaps** against SE373's eight topic areas — see `docs/COURSE.md`. Memory/Context Management is the real one; Agent Skills and Security are cheap now that vendoring is the rule.
5. **Get the milestone dates and grading breakdown.** The announcement in `docs/COURSE.md` has neither, so the phase plan carries no deadline pressure and "are we on track" is unanswerable.
6. Write a block-authoring guide so teammates can add catalog blocks without reading the whole architecture doc.
7. ~~Start phase 1~~ — shipped, tagged `phase-1`.

## Risks being tracked

- **Phase 4 (web plane) is the risk spike.** Largest chunk of upstream, easiest to underestimate. If the semester slips, it slips there.
- Model-authored UI is a demo cliff — keep a deterministic fallback for anything shown live.
- Prefer 3 archetypes that work reliably over 6 that are flaky.
- dsh is a developer preview with an unstable API; Cordis advertises the same.

## Working with me on this

Be concise. Lead with the result. No essays, no restating the question, no narrating steps. Tables over prose for anything comparative. Push back with specifics when a design has a hole — that has been the useful mode throughout.
