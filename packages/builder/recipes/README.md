# @se373/recipes

## What it does

Registers the six shipped recipes, one per SE373 archetype, into `ctx.blocks`.

A recipe is **click-to-prefill**: not just prompt text, but the model, the
thinking effort, the agent preset, the blocks a build is expected to compose,
and the outcome a person should expect. Clicking one loads all of it, ready to
send or edit.

They ship as `kind: 'recipe'`, `origin: 'system'` blocks, which means **forking
a recipe is the same gesture as forking anything else**. A user who wants their
own starter needs no new mechanism, no new UI and no new file location, and
their fork appears in the same cookbook with a different badge.

**A recipe carries a description of the system it builds, not a specification of
it.** Two builds of one recipe may compose differently, and that is intended —
it is what makes a v1-versus-v2 comparison interesting rather than a formality.
The bound on that variance is a conformance suite, and a suite needs a seam to
conform to; `recipe.internal-knowledge` names `ctx.knowledgePipeline` because
its seams exist, and the other five are prose until theirs do.

## Depends on

`@se373/block-registry` (injected as `ctx.blocks`), `@se373/runtime-graph` for
`contributeNode`, `@se373/cordis`.

It is a **row**, for the reason I3 gives for everything else: which recipes ship
is a deployment choice, so it is a config row you can disable rather than an
import somebody has to delete.

## In / out

**In.** Nothing configurable.

**Out.** Six blocks in the repository. Each manifest's `defaults` is the
prefill: `archetype`, `prompt`, `effort`, `preset`, `blocks`, `outcome`.

| Recipe | Archetype |
|---|---|
| `recipe.coding-agent` | Coding Agent |
| `recipe.code-review-agent` | Code Review Agent |
| `recipe.requirement-analysis` | Requirement Analysis Agent |
| `recipe.internal-knowledge` | Internal Knowledge Assistant |
| `recipe.multi-agent-workflow` | Multi-Agent Workflow |
| `recipe.mcp-assistant` | MCP-based Assistant |

## Known Limitations and Deferred Work

- **Only one of the six has been built end to end.** `recipe.internal-knowledge`
  fabricates and answers; the other five name blocks that exist and have never
  been fabricated together, so their block lists are a claim rather than a
  result.
- **`effort` and the model are recorded and unused.** Nothing in the builder
  reads them yet; they are prefill for a chat box that does not exist here.
- **`preset` names a preset nothing joins.** Fabrication mounts rows; it does
  not start a session under `spec.preset`.
- **Prose, by design, but unbounded prose.** Nothing checks that a recipe's
  `blocks` list is coherent — that its seams are covered, or that its tools have
  something to inject.
