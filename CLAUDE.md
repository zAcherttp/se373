# SE373 — Agentic Builder

## What this is

A meta-agent that **builds agents**. Course project for SE373 (Kỹ thuật xây dựng hệ thống Agentic AI, UIT, Semester 1 2026-27, Wednesday mornings). Team, project-based, graded on a complete Agentic AI system.

The course names six archetypes (Coding, Code Review, Requirement Analysis, Internal Knowledge, Multi-Agent Workflow, MCP Assistant). **We are not submitting one of them — we are submitting the thing that emits them.** Not a harness that does A; a harness for which A is a subsystem it can build, inspect, improve, and export.

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

## Upstream reference

- Local clone: `../deepseek-harness` — currently at `47f94385` (Aug 13). **The plan was written against `b150a55` (v0.1.1-rc.2, Aug 21).** Update the clone or expect small drift.
- License: MIT. Copied files keep the upstream notice; `docs/PORTING.md` records per-file provenance.
- Cordis: `cordiverse/cordis`, used unmodified.

## Immediate next steps

1. **D2 — the only real blocker.** Get the instructor's *written* ruling on how much ported MIT code is permitted in a graded project. MIT settles the license; a course plagiarism policy is a separate rule it does not answer.
2. Name the project — `@zoo/*` is a placeholder and appears in every manifest.
3. Write `docs/PORTING.md` (per-file provenance table).
4. Write a block-authoring guide so teammates can add catalog blocks without reading the whole architecture doc.
5. Start phase 1 (Cordis boot).

## Risks being tracked

- **Phase 4 (web plane) is the risk spike.** Largest chunk of upstream, easiest to underestimate. If the semester slips, it slips there.
- Model-authored UI is a demo cliff — keep a deterministic fallback for anything shown live.
- Prefer 3 archetypes that work reliably over 6 that are flaky.
- dsh is a developer preview with an unstable API; Cordis advertises the same.

## Working with me on this

Be concise. Lead with the result. No essays, no restating the question, no narrating steps. Tables over prose for anything comparative. Push back with specifics when a design has a hole — that has been the useful mode throughout.
