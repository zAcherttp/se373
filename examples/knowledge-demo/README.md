# knowledge-demo — phase 6b

The knowledge plane: four seams, a composition, and an agent in front of it.

```bash
pnpm models:acquire                                     # 331 MB, once
node --import tsx/esm examples/knowledge-demo/demo.mts   # the plane
node --import tsx/esm examples/knowledge-demo/agent.mts  # the agent
```

## Three configs, because the plane is shared

| File | What it is |
|---|---|
| `plane.yml` | the knowledge plane — four providers, a dedup listener, a reranker, the composition. Provides no `invariants` and no `runtime-graph`: those belong to whatever includes it |
| `demo.yml` | that infrastructure plus an include of `plane.yml` |
| `agent.yml` | the phase-2/3 agent spine included unchanged, `plane.yml` included unchanged, and one tool row joining them |

`agent.yml` is the phase's claim in three rows: adding retrieval to an existing
agent is config, not code.

## `demo.mts` — seven things

| | |
|---|---|
| 1 | four seams compose, and the generation key is derived from all four |
| 2 | an ingest crawls this repository's own docs, chunks at headings, embeds, stores |
| 3 | retrieval answers, including across languages |
| 4 | a second ingest with nothing changed skips every document by content hash |
| 5 | a document that shrinks has its orphaned chunks swept |
| 6 | changing the chunker re-chunks; changing only the embedder reads chunks back from the previous generation and never touches the corpus |
| 7 | a query against a stale index fails closed rather than answering |

Step 6 is §5.5's positional cascade, and step 7 is what the generation key is
for. Together they are the reason index staleness is computed rather than
declared: nothing in the config *said* the index was stale, and nothing could
have forgotten to.

Step 3 shows one cross-lingual query that works and one that does not, on
purpose. `Cordis là gì?` returns the same top passages as its English
equivalent. `Tại sao chỉ số lỗi thời...` does not, because the corpus contains
no Vietnamese and the question is built from an ad-hoc translation of domain
jargon — `chỉ số lỗi thời` for *stale index* is nobody's usage. That is the
concrete reason D6 asks for a Vietnamese question set somebody wrote rather than
a translation of the English one.

## `agent.mts` — the end condition

Two boots sharing one ephemeral home: the first builds the index, the second
answers with it. The whole path is real except the model — the corpus, the
chunks, the vectors, the tool registration, the schema validation and the
retrieved passages are all the real ones. The mock provider supplies only the
*decision* to call `search_knowledge`, which is the one thing an API key would
otherwise buy.

Two boots rather than one because the headless runner starts its turn as soon as
the tree is up, so there is no moment inside a single boot at which to ingest
first.
