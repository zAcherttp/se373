# SE373 — Agentic Builder

A meta-agent that **builds agents**.

The course's thesis is `Agent = Model + Harness` — the Harness is what makes an
agent a system rather than a chatbot. SE373 names six archetypes to build:
Coding, Code Review, Requirement Analysis, Internal Knowledge, Multi-Agent
Workflow, MCP Assistant.

**This project doesn't submit one of them. It submits the thing that emits
them** — a harness for which an archetype is a subsystem it can compose,
inspect, A/B compare, and export as an installable plugin.

> Course project for SE373 (Kỹ thuật xây dựng hệ thống Agentic AI, UIT,
> Semester 1 2026–27). Pre-semester work; phase 1 of 8 is running.

---

## Status

| Phase | | |
|---|---|---|
| **1** | Cordis boot | ✅ shipped — [`phase-1`](../../releases/tag/phase-1) |
| 2 | Agent spine → headless chat | next |
| 3 | Tools → it can do work | |
| 4 | Web plane → the chat box | ⚠️ risk spike |
| 5 | Multi-agent | |
| 6a–d | Embeddings → knowledge plane → builder plane → authoring | |
| 7 | Export: plugin + MCP server | |
| 8 | Eval / A-B | |

Every phase ends with something that **runs**, gets a git tag, and gets an entry
in [`docs/FEATURE-LOG.md`](docs/FEATURE-LOG.md). To see a feature working as it
shipped, check out its tag.

```bash
git checkout phase-1
```

## Run it

Requires Node ≥ 24 and pnpm.

```bash
pnpm install
npx tsc -b tsconfig.vendor.json    # build vendored framework declarations, once
pnpm se373
```

```
[I] hello-service  hello, se373
[I] root           booted examples/hello/cordis.yml
[D] hello-service  tick 1
[I] root           unloading on SIGINT
[I] hello-service  hello disposed after 3 tick(s)
[I] root           unloaded
```

That last pair is the point. Phase 1's claim isn't that a plugin loads — it's
that unloading it **unwinds**, which is invariant I6 and the thing everything
above depends on.

```bash
pnpm test        # vitest
pnpm typecheck   # tsc
pnpm lint        # oxlint
```

## What's built vs what's taken

| | |
|---|---|
| **Taken** — vendored from DeepSeek Harness, documented not rewritten | the agent spine, tools, web plane, sandbox, skills, compaction, MCP client |
| **Built** — no upstream analogue exists | the knowledge plane (L3) and the builder plane (L4) |

Nothing upstream corresponds to `ctx.embedder`, `ctx.chunker`,
`ctx.vectorStore`, `ctx.blocks`, `ctx.retrievalEval`, or `ctx.promotion`. The
vendored spine is the floor; those two planes are the project.

`bundle/base` is upstream's own answer to "what does a working harness need", so
that's the selector — 187 of 227 packages taken. The 40 exclusions all need
external infrastructure (e2b, ACP, LSP, PTY, third-party search keys). Anything
vendored but unwanted is `disabled: true` in a config row, not an exclusion.

## Layers

```
L4  Builder plane      orchestrator, catalog, promotion, export     ← built
L3  Knowledge plane    corpus→chunk→embed→store→retrieve→rerank     ← built
L2  UI plane           slots, primitives, views                      ← taken
L1  Agent spine        sessions, llm, tools, agents, loop, prompt    ← taken
L0  Cordis             context, service, plugin, effect, loader      ← vendored
```

## The nine invariants

| # | |
|---|---|
| I1 | The model authors **implementations**, never **seam contracts** |
| I2 | A generated agent is **alive on arrival** |
| I3 | Swapping a stage is a **config-row edit**, never a code edit |
| I4 | A pipeline is a **named, versioned value** |
| I5 | The graph is **derived from the live runtime** |
| I6 | Every registration is a **reversible effect** |
| I7 | Authored code mounts only after passing its **seam conformance suite** |
| I8 | Building is **plan-gated** |
| I9 | Every failure is **attributable and logged** |

## Docs

| | |
|---|---|
| [Architecture](docs/agentic-builder-architecture.md) | the full technical plan — read before proposing architecture changes |
| [Feature log](docs/FEATURE-LOG.md) | append-only; what shipped, with a tag to rewind to |
| [Course reference](docs/COURSE.md) | SE373's eight topic areas, mapped onto our phases |
| [Porting & provenance](docs/PORTING.md) | what's vendored, from where, and what we changed |
| [Vendor surface](docs/VENDOR-SURFACE.md) | the nine framework packages: purpose, deps, in/out shapes |
| [Runtime observability](docs/design/runtime-observability.md) | design note — the runtime graph and the app log |

## Attribution

- **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — MIT,
  © DeepSeek. Vendored packages keep the upstream notice;
  [`docs/PORTING.md`](docs/PORTING.md) records per-file provenance.
- **[Cordis](https://github.com/cordiverse/cordis)** — MIT, the plugin
  framework. Source-vendored under `vendor/`, rescoped to `@se373/*`.

MIT.
