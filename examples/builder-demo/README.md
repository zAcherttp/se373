# builder-demo — phase 6c

A recipe becomes a working agent.

```bash
pnpm models:acquire                                    # 331 MB, once
node --import tsx/esm examples/builder-demo/demo.mts
```

The config has **no knowledge plane in it**. That is the point: the plane is what
gets fabricated — mounted at runtime from a recipe, into its own realm — and it
would be uninteresting if it were already running.

| | |
|---|---|
| 1 | the repository holds blocks with provenance, versions and parentage |
| 2 | the cookbook offers six recipes, one per SE373 archetype |
| 3 | planning resolves a recipe to a **value** — rows, config, isolates — and registers it, running nothing |
| 4 | fabricating without approval is refused (I8) |
| 5 | approving and fabricating mounts a live Cordis subtree in its own realm |
| 6 | the subtree appears on the runtime graph by itself (I5) — nothing in the demo tells the graph about it |
| 7 | the fabricated agent ingests and answers, through the same seams the config-file version uses |
| 8 | dismantling unwinds it with one disposer (I6), and the spec stays in the repository |

Step 3 is worth reading closely. The plan lists nine rows, six isolates and one
warning — `block.tool-knowledge-search: will not start: nothing provides tools,
systemPrompt`. That warning is true: this tree has no agent spine, so the tool
row mounts `pending` and never starts. The graph in step 6 shows exactly that,
and the plan said it first, while there was still somebody to say it to.

Step 8's node count drops from 21 to 11 — the whole subtree, gone with one
disposer, leaving the spec it was built from behind.

## A note on where the config lives

Fabrication writes the emitted rows back through the loader, because a
fabricated agent is a durable config value (I4) rather than a runtime object
that evaporates. So the demo boots from a **copy** and leaves the file in the
repository alone.

The copy lives beside the original, in a gitignored `.run-*` directory, rather
than in the throwaway home — Node resolves a row's module by walking up from the
config file, and a config in `/tmp` has no `node_modules` above it, so every row
fails to import.
