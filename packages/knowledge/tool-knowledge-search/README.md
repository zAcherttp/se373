# @se373/tool-knowledge-search

## What it does

Registers `search_knowledge`, the model's door into the knowledge plane.

§5.6 is the whole design: it injects **`ctx.knowledgePipeline` only**, never an
individual stage. Swapping the chunker, the embedder or the store is then
invisible here, so the tool never needs regenerating and its schema never
encodes a stage's vocabulary. A tool that injected `ctx.embedder` to "check the
dimensions" would tie the model's interface to a config row.

A separate package from the pipeline for the same reason `tool-graph-inspect` is
separate from `runtime-graph`: the pipeline is infrastructure, and handing it to
a model is a deployment choice — which invariant I3 says is a row you can
disable, not an import you have to delete.

## Depends on

| | |
|---|---|
| `@se373/knowledge` | `ctx.knowledgePipeline` and `RetrievedChunk` |
| `@se373/tools` | `defineTool`, schema validation, the guard pipeline |
| `@se373/system-prompt` | the one prompt line telling the model when to reach for it |
| `@se373/runtime-graph` | `contributeNode`, so it appears as `tool`/L3 |

## In / out

**In — tool parameters.** `query` (required, any language) and `k` (optional,
defaults to the pipeline's configured value).

**Out — the tool result.** `{ query, hits: [{ key, title, text, distance }] }`,
rendered for the model as a numbered list with the section heading, the chunk
key and the distance on each entry.

Declared `isConcurrencySafe`, because retrieval reads a generation and writes
nothing.

The description tells the model three things it cannot infer: that the index is
multilingual so the question should be asked in the language it arrived in; that
distances rank within one result set and mean nothing across queries; and that a
stale index refuses rather than answering.

## Known Limitations and Deferred Work

- **No ingest tool.** The model can search but cannot build or refresh an index,
  and cannot see whether one exists. `status()` has everything a `knowledge_status`
  tool would need.
- **Errors reach the model as raw messages.** A stale-index refusal is a long
  sentence about generation keys — accurate, and not written for a model to act
  on.
- **No citation contract.** The prompt line asks the model to cite passage keys;
  nothing checks that it does, and a key is not a link to anything.
- **No pagination or filtering.** One `k`, no offset, no metadata predicate, so
  the model cannot narrow by document or ask for more of the same.
- **The rendered text is untested.** Per the project's testing rule, rendered
  output is excluded — a renderer change that garbled the passages would not fail
  anything.
