# authoring-demo — phase 6d, step 3

An agent-authored block passes its conformance suite and hot-swaps into a
running agent. No restart; one config-row edit.

```bash
pnpm models:acquire                                      # 331 MB, once
node --import tsx/esm examples/authoring-demo/demo.mts
```

The arc:

| | |
|---|---|
| 1 | an internal-knowledge agent is fabricated over a corpus whose documents carry YAML front matter, and retrieval shows the front matter *in the passages* — a limitation the shipped chunker's README admits |
| 2 | a **broken** fork is authored first; the suite refuses it with the rule it broke (`text was lost`), as an ordinary result — repair is a loop iteration |
| 3 | the corrected fork passes gate → write → syntax → typecheck → conformance; `mountable` flips from refusal to `allowed … passed the ctx.chunker suite (I7)` |
| 4 | the running agent's chunker row is renamed to the fork — I3's own gesture — and the pipeline immediately reports itself stale, because the chunker's digest moved: computed, never declared |
| 5 | the gated rebuild runs, and the same question now retrieves clean passages: the agent answers through code the model wrote |

Along the way the demo exercises both halves of the plan gate (the fabrication
card and the rebuild card), and the fork earns its way past the same registry
policy that refused the broken attempt.

## What building this caught

Node's module cache. The broken attempt imports `forks/<name>/index.ts`; the
corrected attempt writes new bytes at the same path, and a bare `import()`
returns the **cached broken class** — so certification would vouch for bytes it
never ran. The conformance import is now keyed by the content digest
(`?sha=…`), and the staging gate uses the same key when it refreshes rows. The
repair-loop spec pins both.
