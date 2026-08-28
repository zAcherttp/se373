# realm-split

A falsification test for one specific way the runtime graph could be wrong.

Resolving an injected service **name** to a provider is realm-dependent. Two
pipelines publishing the same seam in two isolation realms — which is exactly
what the A/B design does — would collapse into one plausible-looking edge if the
edge algorithm keyed on the name alone, and nothing in the system would report
the mistake.

This tree makes that mistake fail loudly. `alpha` and `beta` each isolate
`loggerJsonl`, so each half mounts its own provider under its own symbol, and
each half's consumer must resolve to its **own** provider.

```bash
node --import tsx/esm examples/realm-split/inspect.mts
```

Exits `0` and prints `PASS` when the two consumers reach two distinct providers;
exits `1` when they collapse into one.

| File | |
|---|---|
| `cordis.yml` | the tree: two isolated groups, one service name |
| `consumer.ts` | a row whose only job is to inject `loggerJsonl` by name |
| `inspect.mts` | boots the tree, prints the graph, asserts the two edges differ |
