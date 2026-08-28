# Feature Log

**Append-only.** Add entries at the bottom; never edit or delete an entry above.
A past entry describes what was true at that commit — correcting it destroys the
record. If something turns out wrong, write a new entry that says so.

## Why this file exists

Three jobs, and it is the only file that does all three:

1. **What actually shipped**, as opposed to what is planned. The architecture
   doc describes an intended system; this describes the built one.
2. **Roadmap alignment.** Each entry names the SE373 topic area it serves (the
   eight in [COURSE.md](COURSE.md)), so a phase that covers no topic is visible
   before the demo rather than after it.
3. **Rewind.** Every entry carries a git tag. To show a feature the way it was
   when it worked, check out the tag.

```bash
git tag -l                  # every demonstrable point
git checkout phase-1        # rewind to that feature, working
git checkout main           # come back
```

## Entry format

Copy this block. Keep it short — the commit message carries detail.

```markdown
## <tag> — <title>

**Date** · **Commit** `<sha>` · **Tag** `<tag>`

**Roadmap** — <SE373 topic area(s) from COURSE.md, or "infrastructure">
**Phase** — <§13 phase number and name>

**Demonstrable**
<one paragraph: what a person can see working, and the exact command>

**Packages**
| Package | What it does |
|---|---|

**Not yet**
<what this deliberately does not do, so the next entry is not a surprise>
```

## Rules

- **One entry per tag, one tag per demonstrable feature.** A phase that ends
  with nothing runnable does not get an entry — that is the point of the log.
- **Tag before writing the entry**, so the sha is real.
- **The `Demonstrable` command must actually run** on a fresh clone at that tag.
  If it needs a build step first, say so in the entry.
- **`Not yet` is required.** An entry without it reads as a completeness claim.

---

## phase-1 — Boot a plugin tree, and prove it unwinds

**2026-08-26** · **Commit** `eebab0b` · **Tag** `phase-1`

**Roadmap** — Infrastructure, plus the first third of topic 8
(*Observability*): the logger channel and the invariants registry are both
standing. Serves no other topic directly; every later one stands on it.
**Phase** — §13 phase 1, "Cordis boot".

**Demonstrable**

A CLI boots a plugin tree from a config file, a service publishes onto the
context, and interrupting the process unloads the tree with its disposal
visible. That last part is the actual claim: invariant I6 says every
registration is a reversible effect, and this shows the effect running.

```bash
pnpm install && npx tsc -b tsconfig.vendor.json && pnpm se373
```

```
[I] hello-service  hello, se373
[I] root           booted examples/hello/cordis.yml
[D] hello-service  tick 1
[I] root           unloading on SIGINT
[I] hello-service  hello disposed after 3 tick(s)
[I] root           unloaded
```

**Packages**

| Package | What it does |
|---|---|
| `vendor/*` (9) | The Cordis framework, source-vendored and rescoped. See [PORTING.md](PORTING.md). |
| `@se373/invariants` | Registry of package-owned runtime checks; every later package's `./invariant` companion registers here. |
| `@se373/hello` | Proof plugin. A service, a config row, and a timer whose disposal is audible. |
| `@se373/cli` | Boots a config tree; resolves plugin names relative to the config, not the cwd. |

**Not yet**

No LLM, no session log, no tools, no UI — nothing above L0. `@se373/hello` is
a demo and gets deleted when a real service takes that ground. The console
exporter is mounted by the CLI rather than configured as a row, so per-package
log levels (§11.2) are not yet a config edit.

---

## phase-2 — One task in, one answer out

**2026-08-27** · **Commit** `2591197` · **Tag** `phase-2`

**Roadmap** — Topic 4 (*Memory & Context*): the append-only session log and the
assembled system prompt. Topic 8 (*Observability*) gains its second third: every
vendored package's `./invariant` companion now registers against the registry
phase 1 stood up. Topic 2 (*Tool Use*) has its runtime mounted but no tools in
it — that is phase 3.
**Phase** — §13 phase 2, "Agent spine".

**Demonstrable**

The harness takes a task, runs a real turn — session log, system prompt,
streaming provider, retry policy — prints the assistant's answer, and exits.

```bash
export DEEPSEEK_API_KEY=...
pnpm install && npx tsc -b tsconfig.vendor.json
pnpm se373 examples/chat/cordis.yml "what is 2 + 2"
```

Without a key, the same shipping config runs against a local mock provider:

```bash
pnpm test        # apps/cli/tests/spine.spec.ts boots examples/chat/cordis.yml
```

That spec is the honest gate. It boots the config that ships rather than a row
list assembled in the test, so the only thing it fakes is the provider on the
far side of the wire.

**Packages**

31 vendored from dsh; the load-bearing ones:

| Package | What it does |
|---|---|
| `@se373/session` | The append-only event log a turn is written to |
| `@se373/llm` | The provider seam; `llm-deepseek` and `llm-retry` sit behind it |
| `@se373/agent` + `@se373/agent-loop` | Agent handles and the one driver that runs a turn |
| `@se373/system-prompt` | Assembles persona, sections, and tool schemas |
| `@se373/tools` | The tool runtime — mounted, empty until phase 3 |
| `@se373/headless` | dsh's one-shot runner: create an agent, follow up, print, exit |
| `@se373/settings-file` + `@se373/credentials-local` | Where the API key comes from |
| `scripts/vendor-dsh.mjs` | Ours. Walks the closure, rescopes, re-applies divergences |

**Not yet**

- **No tools.** `ctx.tools` is mounted and empty, so the agent can answer but
  cannot act. That is phase 3, and it is what makes the harness useful.
- **One shot, not a chat.** The runner answers once and exits; there is no
  conversation, no resume, and no UI. Phase 4 owns the chat box.
- **28 of `base + headless`'s 126 packages.** Everything the other 98 provide —
  sandbox, skills, compaction, subagents, goals, jobs — is absent, not disabled.
- **`~/.se373`, not `~/.dsh`.** A local modification to `home-paths` keeps our
  sessions and credentials out of a co-installed dsh, so an existing dsh key is
  not picked up; export `DEEPSEEK_API_KEY` or write our own credential store.
- **Upstream tests are not vendored.** These 31 packages are exercised by two
  specs of ours, not by dsh's suite.

---

## correction — phase-1's commit sha is dead

**2026-08-27**

The phase-1 entry above names commit `eebab0b`. That object does not exist. On
2026-08-26 the whole history was rewritten twice — once to fix the author name,
once to shorten the commit messages — and `git filter-branch --tag-name-filter
cat` moved the `phase-1` tag onto the rewritten commit without touching the sha
written into this file.

The tag is correct and is what matters for rewinding:

```bash
git checkout phase-1     # ee84251, the same tree eebab0b had
```

Per this file's own rule the entry above stays as written. The lesson is
narrower than "do not rewrite history": **a tag survives a rewrite and a
recorded sha does not**, so the tag is the rewind point and the sha is a
convenience that can go stale.

---

## phase-3 — It can do work

**2026-08-27** · **Commit** `132cb4b` · **Tag** `phase-3`

**Roadmap** — Topic 2 (*Tool Use*) in full: a tool registry, schema-validated
arguments, a guarded execute pipeline, and results back into the session log.
Topic 8 (*Verification & Security*) gains the sandbox and approval seams.
**Phase** — §13 phase 3, "Tools".

**Demonstrable**

The agent reads files, searches, runs commands, and edits code.

```bash
export DEEPSEEK_API_KEY=...
pnpm install && npx tsc -b tsconfig.vendor.json
pnpm se373 examples/chat/cordis.yml "how many .ts files are under apps/?"
```

**This one needs a key** — unlike phase 2, there is no key-free path in the
tree, because proving a tool ran means proving a *model* asked for it. What was
verified before tagging, driving the mock provider to emit a `bash` call
against the shipping config:

```
tool/call    bash  {"command":"echo TOOLS-RAN && ls apps/cli/src", ...}
tool/result        "TOOLS-RAN\nbin.ts\nboot.ts\n"    isError: false
```

The first attempt is the more useful evidence: it came back
`invalid arguments: missing required property "description"`. The registry was
validating against the real registered schema, not passing bytes through.

**Packages**

28 more vendored, 59 total:

| Package | What it does |
|---|---|
| `@se373/tool-bash` | Shell commands, through the sandbox |
| `@se373/tool-fs` + `@se373/tool-fs-search` | Read and write; grep and glob via a packaged ripgrep |
| `@se373/tool-str-replace-editor` | The edit tool |
| `@se373/sandbox-local` + `@se373/sandbox-policy` | The file-effect boundary. Seatbelt on macOS, bwrap or Landlock on Linux |
| `@se373/subprocess-local` | The only subprocess provider upstream ships; brings `node-pty` |
| `@se373/permission-presets` + `@se373/user-approval` | read-only / workspace-write / danger-full-access, and who gets asked |
| `@se373/spill-policy` | Keeps an oversized tool result out of the context window |

**Not yet**

- **Approval has no one to ask.** The default `workspace-write` preset means
  `ask`, and a one-shot run has no UI to ask through, so a tool needing approval
  hangs. `SE373_PERMISSION_MODE=danger-full-access` is the current escape.
  Phase 4 is what makes `ask` real.
- **Landlock is inert.** Its Linux prebuilds are `workspace:*` ranges into a
  native tree we do not vendor. Fine on macOS; on Linux it narrows the available
  sandbox backends and nothing says so at runtime.
- **Still one shot.** No conversation, no resume, no todo list, no subagents,
  no skills, no compaction — 59 of the 187 in-scope packages.
- **No key-free demonstrable.** See above.

---

## phase-3.5 — The agent can inspect its own runtime

**2026-08-28** · **Commit** `769373a` · **Tag** `phase-3.5`

**Roadmap** — Infrastructure, plus Topic 2 (*Tool Use*): `graph_inspect` is a
tool like any other, registered through the same registry with the same
canonical output contract. It is also the data layer phase 4's board renders,
so a late phase 4 costs the *view*, not the projection.
**Phase** — §13 phase 3.5, "Runtime graph".

**Demonstrable**

The agent asks what is running inside its own process and gets a structured
answer back — no API key, because the mock provider supplies only the *decision*
to call the tool. Everything else is the shipping tree.

```bash
pnpm install
node --import tsx/esm examples/graph-demo/demo.mts
```

It prints the tool result and the path of the run log that boot just wrote:

```
--- graph_inspect returned ---
1 of 41 rows — disabled 1

294ad8f1:mcp-client  (@se373/mcp-client)
  lifecycle       disabled
  ...
  config
    { "transport": "stdio", "serverName": "everything", ... }
--- end ---
That is the component that is configured but not running.

run log for this boot: ~/.se373/logs/20260828T055040535Z-11331.jsonl.zstd
```

The disabled row is the point. It has no fiber, no lifecycle and no live
instance, and it is in the projection anyway, with its connection config intact
— you cannot turn on what you cannot see.

Two more, both key-free, both run from a clean checkout at this tag:

```bash
node --import tsx/esm examples/realm-split/inspect.mts   # exits 0 on PASS, 1 on collapse
pnpm test                                                # 2 files, 10 tests
```

`realm-split` is a falsification test: two isolation realms publishing one
service name. It exits non-zero if edge resolution ever stops being
realm-aware, which is a mistake that is otherwise silent until the A/B demo.

**Note on the vendor build.** `npx tsc -b tsconfig.vendor.json` is still needed
before `pnpm typecheck` (it emits the declarations `paths` points at), and it
still exits `2` with ~447 errors — 236 in `vendor/schemastery`, 25 in
`vendor/loader`, none in ours. It emits regardless, and `pnpm typecheck` is
clean afterwards. Pre-existing since phase 1; recorded here so the next person
does not read it as damage.

**Packages**

Three of ours — the first packages in this repo that are not vendored and not a
demo — and one more vendored, 60 total:

| Package | What it does |
|---|---|
| `@se373/runtime-graph` | `ctx.runtimeGraph`. Every configured row, disabled ones included, across three derived axes plus realm, realm-aware dependency edges, observed lifecycle transitions, and an optional contributed role via the `graph/node` waterfall |
| `@se373/tool-graph-inspect` | `graph_inspect`, its own row so it is disable-able (I3) |
| `@se373/logger-jsonl` | A second Cordis exporter beside the console one. One run-keyed JSONL file per run under `$SE373_HOME/logs`; a missing footer is how a crash is identified |
| `@se373/mcp-client` (vendored) | Ships as a `disabled: true` row with its connection shape filled in. Closes D10: verified against `@modelcontextprotocol/server-everything`, 13 tools arriving as `mcp__everything__*` |

**Not yet**

- **No push transport.** The snapshot is point-in-time and D9 is still open on
  purpose: `pluginInventory.list()` is poll-only upstream, and the right answer
  depends on what the board needs. Transitions are the one piece of history the
  projection keeps, which is what lets a poller recover what it slept through.
- **Almost every row is untyped.** Only our three packages contribute to
  `graph/node`; the 60 vendored rows contribute nothing, so `role: seam` is not
  yet the useful default view it is meant to become. Annotating a vendored
  package would mean editing it, and the next sync would overwrite it.
- **Transitions start when the graph row mounts**, not when the process does.
  `internal/status` has no backlog. Same boundary the app log has.
- **No failure reason on a `failed` node.** Cordis keeps the startup error
  private to the fiber. The transitions show the path in; the log says why.
- **Nothing renders any of this.** No board, no log dock, no browser at all —
  that is phase 4, and it is the risk spike.
