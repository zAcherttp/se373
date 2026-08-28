# graph-demo

The phase-3.5 demonstrable, without an API key.

```bash
node --import tsx/esm examples/graph-demo/demo.mts
```

It boots **`examples/chat/cordis.yml`** — the tree that ships, not a row list
assembled for the demo — with the DeepSeek adapter pointed at the local mock
provider. Everything between the task and the answer is real: the tool
registry, schema validation, the guard pipeline, the canonical output
declaration, the renderer, and the session log. The only thing the mock
supplies is the *decision* to call `graph_inspect`, which is precisely what an
API key would otherwise be buying.

The agent asks for the rows that are configured and not running, and gets back
the `mcp-client` row: disabled, therefore no fiber, therefore no lifecycle — and
present anyway, with its connection config filled in, because you cannot turn on
what you cannot see.

The run's JSONL log path is printed at the end. Read it back with
`readRunLog()` from [`@se373/logger-jsonl`](../../packages/runtime/logger-jsonl/README.md).

## Known Limitations and Deferred Work

- **The model is a fixture.** The mock is told which tool to call. This
  demonstrates that the tool works end to end, not that a model chooses it well.
  A real key and `pnpm se373 examples/chat/cordis.yml "<question>"` is the
  unscripted version.
- **`SE373_PERMISSION_MODE=danger-full-access` is set by the script**, because a
  one-shot run has nobody to answer an approval prompt. Phase 4 is what makes
  `ask` real.
