# web

The browser surface: dsh's chat UI over our harness.

```bash
pnpm build                              # required — the browser cannot run from source
pnpm se373 examples/web/cordis.yml
```

It prints a URL and opens it. `--no-open` skips the browser, `--port <n>` moves
it, `--help` lists the rest.

The first screen asks for a DeepSeek API key; the key is stored by
`credentials-local` under `$SE373_HOME` (default `~/.se373`), never in the repo.
`Configure later` gets you a working UI with no model behind it.

## What is in the tree

108 rows, of which 107 are live and one — `mcp-client` — is deliberately
disabled and visible, because a row you cannot see is one you cannot turn on.

| Layer | |
|---|---|
| Host spine | transcribed from dsh's `bundle/base`, restricted to what we vendored |
| Web host + transport | transcribed from dsh's `bundle/web-app` patch |
| Browser roster | the `dsh.client` rows, each served as a `lib/client.js` bundle |
| Ours | `runtime-graph`, `logger-jsonl`, `tool-graph-inspect`, and their invariant companions |

Both bundles are transcribed rather than mounted: we do not vendor them *as
bundles*, because between them they name ~36 packages outside our closure.

## Known Limitations and Deferred Work

- **The tool rows are on the host plane, not behind agent presets.** Upstream's
  web patch disables every model-facing tool row here, because each Web session
  mounts an agent *preset* that composes its own. We ship no preset roster yet
  (phase 5), so the rows stay where the chat tree has them — otherwise the agent
  would open with no tools at all.
- **`plan-mode` is absent.** Its entire configuration is the prompt section it
  injects, and that section is upstream's product writing rather than a default
  we can supply. `ui-plan` renders nothing without it.
- **Several base rows are absent because their implementations are not
  vendored** — background jobs (`jobs-local`), subagent spawning, compaction,
  web search, skills on disk. Each is a seed-list edit away, not a design
  question.
- **Approval is `ask` and there is now somebody to ask** — which is what phase 4
  was for. `SE373_PERMISSION_MODE=danger-full-access` still bypasses it.
- **No board yet.** `ctx.runtimeGraph` is mounted and `graph_inspect` works from
  the chat box, but nothing renders the graph. That is the next slice.
