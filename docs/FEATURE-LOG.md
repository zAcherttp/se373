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

---

## phase-4 — Your chat box, and the board beside it

**2026-08-28** · **Commit** `16639d0` · **Tag** `phase-4`

**Roadmap** — Topic 6 (*Human-in-the-loop*) becomes real: approval is `ask` and
there is finally somebody to ask. Topic 3 (*Multi-turn Conversation*) arrives
with dsh's session surface. Infrastructure otherwise — this is the phase that
turns a headless spine into something a person can drive.
**Phase** — §13 phase 4, "Web plane".

**Demonstrable**

A browser. Open the URL it prints, paste a DeepSeek key when it asks, and talk
to the agent; the board is the pill in the bottom-right corner.

```bash
pnpm install
pnpm build
pnpm se373 examples/web/cordis.yml
```

`pnpm build` is not optional here and never will be: the host runs from source
under `tsx`, and the browser cannot. It is a four-stage chain — host `tsc`, the
typert codegen, client `tsc`, then `tsdown` per client package — plus Vite over
the shell.

Run from a clean checkout at this tag: install, cold build, boot, and the shell
came up with the board reporting `112 rows · 111 active · 1 disabled`.

**A real turn has been driven through it**, by the repository's owner, with a
real key. That is the first time anything in this project has been used rather
than verified — every earlier phase was headless or mock-driven.

**Packages**

86 more vendored, 146 total, plus the four shell-side seeds `apps/web` links
statically. Two of ours are new, and they are the first packages of ours to be
first class in the vendored client plane:

| Package | What it does |
|---|---|
| `bundle/web-app` closure (vendored) | dsh's browser surface: the transport, the host rows, and the whole `dsh.client` roster |
| `@se373/web-frontend` (`apps/web`, ours) | the Vite shell over `@se373/client-web`. Ours because it is an application, not a plugin — and because its branding is not upstream's to lend |
| `@se373/board-gateway` | `ctx.runtimeGraph` as a Remote namespace, behind the `/api` browser-trust fence |
| `@se373/client-ui-board` | the board, in the shell's frame-wide overlay seat |
| `session-query-sqlite`, `attachment-local` | not optional despite upstream calling them so: `host-apiproxy` *injects* both, and without either the whole gateway sits pending and every `/api` route 404s |

44 `lib/client.js` browser bundles are produced, 43 of them upstream's and one
ours — and ours passed upstream's own bundle-purity gate, which is the real
evidence the rescope did not break the client module edges.

**Not yet**

- **No push transport (D9).** The board reads on open and on `Refresh`. Phase 4
  narrowed the decision rather than making it: transitions travel with the
  payload, so a polling consumer recovers the history it slept through, which
  makes this a latency question rather than a correctness one.
- **The board is a panel, not a canvas.** No node-and-edge drawing. The list
  answers what is running, what failed and why one is stuck; the drawing is for
  when there is something it explains that the list does not.
- **Tools are on the host plane, not behind agent presets.** Upstream's web
  patch disables every model-facing tool row because each session mounts a
  preset that composes its own. We ship no preset roster yet — that is phase 5 —
  so they stay where the chat tree has them.
- **Several base rows are absent because their implementations are not
  vendored**: background jobs, subagent spawning, compaction, web search, skills
  on disk, `plan-mode`. Each is a seed-list edit, not a design question.
- **Still no board-side tests.** The standing decision was to hold testing until
  the web plane; the web plane has now arrived, so that decision is due for
  re-reading rather than renewal.

---

## phase-5 — Subagents run

**2026-08-28** · **Commit** `f0a0b68` · **Tag** `phase-5`

**Roadmap** — Topic 7 (*Multi-Agent Systems*): one agent delegates to another,
each composed from a named, versioned composition rather than from process-wide
configuration.
**Phase** — §13 phase 5, "Multi-agent".

**Demonstrable**

```bash
pnpm build
node --import tsx/esm examples/subagent-demo/demo.mts
```

Exits `0`; no API key. Run from a clean checkout at this tag:

```
preset  standard
children: 1
  2c77a49c-…  mode=one-shot activity=inactive label="count the runtime rows"
parent transcript: 36 events
  tool/call    subagent
  tool/result  "Delegated and done."
```

The `label` is the description the parent's own tool call carried, so it is
evidence the delegation reached the child rather than a coincidence of naming.

**Packages**

Four more vendored, 150 total: the delegation backends, the jobs implementation,
skills on disk, and the compaction stack. Nothing of ours is new — phase 5 is
composition, not code.

| | |
|---|---|
| `config/agent-presets/standard` | dsh's own preset, transcribed and restricted to what we vendor. 22 tools |
| `config/agent-presets/inspect` | ours. 7 tools, no shell, no delegation, a read-only filesystem realm of its own |
| `examples/subagent-demo` | the demonstrable, over `/api` |

**The finding worth keeping.** Writing `inspect` caught a false claim of mine
before it shipped: its persona said it could not edit files, and the composed
catalog said otherwise, because `tool-fs` registers `read`, `write` and `edit`
as one suite with no read-only switch. Two mechanisms were being conflated —
*absent* (not composed, so not in the catalog, nothing to call) and *denied* (in
the catalog, refused at the boundary). The preset now uses both deliberately and
its persona says which is which, because an agent told it cannot do something it
can see in its own catalog will try anyway.

**Not yet**

- **Presets are a web-plane feature here.** The gateway composes an agent from a
  preset at session creation; `examples/chat/cordis.yml` builds its agent
  through the headless runner instead, so that tree keeps host-plane tools.
- **One child, one shot.** `subagent_fork`, background mode, `list_agents` and
  `interrupt_agent` are composed in `standard` and none is exercised.
- **The child's own transcript is not read back.** The gateway serves the
  sessions a client owns, and a subagent belongs to its parent.
- **`plan-mode` is still absent from both presets**, for the same reason as
  before: its whole configuration is upstream's product writing.
- **Still two specs.** The standing decision to hold testing until the web plane
  has now outlived its condition twice.

---

## phase-6a — Vectors exist, and they refuse to mix

**2026-08-29** · **Commit** `8f6dbe0` · **Tag** `phase-6a`

**Roadmap** — Topic 5 (*Retrieval / knowledge*), first half: the write path and
the store. Retrieval quality, chunking and ingest events are 6b. Also topic 8
(*Observability*), by way of the fingerprint being the thing an index is
diagnosed with.
**Phase** — §13 phase 6a, "Embedding seam".

**Demonstrable**

```bash
pnpm models:acquire                                   # 331 MB, once
node --import tsx/esm examples/embed-demo/demo.mts
```

Six documents embed in ~60 ms and are retrieved by meaning — including a
Vietnamese question against an English corpus — with no API key and no network
once the weights are on disk. Then a second embedder in its own realm, holding
*the same weights at the same revision* but storing 256 dimensions instead of
768, produces a query vector the generation refuses. That refusal is the phase's
real claim: "must the same model embed and query" is answered structurally, not
in documentation.

The first phase with no upstream analogue at all. `packages/llm` ships chat
adapters, and the shared model router does not cover embeddings, so
vendor-and-document stops carrying the work here.

**Packages**

Five of ours; nothing new vendored (still 150).

| Package | What it does |
|---|---|
| `@se373/embedding` | the `ctx.embedder` seam: identity digest, templating, Matryoshka truncation, conformance suite |
| `@se373/model-registry` | `ctx.modelRegistry`: declared rows pinned to bytes, a content-addressed cache, deliberate acquisition |
| `@se373/embedder-onnx-local` | the default provider — onnxruntime-node plus `@lenml/tokenizers` |
| `@se373/vector-store` | the `ctx.vectorStore` seam: generations, and `assertComparable` |
| `@se373/vs-sqlite-vec` | the default store — one SQLite file per generation, `vec0` over `node:sqlite` |
| `examples/embed-demo` | the demonstrable |

**Four decisions, each checked rather than argued.**

*The ONNX graph pools for us.* The export emits `sentence_embedding`, so
mean-pooling, both Matryoshka dense heads and the normalize are inside the
graph. The largest silent-failure surface the raw-onnxruntime path was supposed
to cost us does not exist. What stays ours is templating, truncation and the
fingerprint.

*The ungated mirror, not the Google repo.* `google/embeddinggemma-300m` is
`gated: manual` and ships no ONNX; `onnx-community/embeddinggemma-300m-ONNX` is
ungated and ships six variants. A gate would have put a browser consent step
inside an automated acquisition. `fp16` and `q4f16` are unusable — the model
card is explicit that EmbeddingGemma activations do not support fp16.

*Dimensionality belongs to a generation.* This revises D4, which pinned 384 to
keep the store schema stable. Matryoshka makes that wrong: one set of weights
backs 768, 512, 256 and 128, and a `vec0` table declares its width in DDL, so
the generation is exactly where a width can live. 384 was also excluding the
strongest current small multilingual model, which cannot produce it.

*Identity travels with the vectors.* `embed` returns `{fingerprint, dims,
vectors}`, never a bare `Float32Array[]`. Per-chunk model metadata was
considered and rejected: it makes a mixed-model generation *representable*, and
every query against one returns a confident arbitrary ranking with nothing
raising an error.

**The finding worth keeping.** One of the fourteen mutations was not caught, and
the reason mattered. Asserting that `drop` removes `-wal` and `-shm` after an
ordinary drop proves nothing — SQLite deletes its own on a clean close, so the
assertion passes whether or not the store does anything. The files that actually
matter are orphans from a process that died mid-write, which a later generation
reusing the id would adopt as its journal. The test now creates that case. This
is the second time the mutation requirement has caught a spec that was passing
for the wrong reason.

**Not yet**

- **Only the write path.** No corpus source, no chunker, no reranker, and
  neither `knowledge/pre-retrieve` nor `knowledge/post-retrieve`. A generation
  records its embedder identity but not its chunker or source, so the full
  write-path fingerprint the design calls for is one stage of four.
- **Nothing ingests.** The demo hands the store six string literals. There is no
  crawl, no incremental re-ingest, and the per-chunk content hash that would
  make one possible is specified in the README and not implemented.
- **The flip is manual.** `create` → `upsert` → `activate` → `drop` all exist
  and compose into the generation dance, but nothing drives them; there is no
  rebuild command and no staleness detection reading the fingerprint back.
- **The second model is declared, not exercised.** `multilingual-e5-small-int8`
  ships as a registry row and has never been downloaded, so the
  `last_hidden_state` mean-pooling path is covered by unit tests over fabricated
  tensors and by nothing else.
- **CPU only, and unmeasured beyond demo scale.** No execution-provider choice,
  no length-sorted batching, and `vec0` runs with its defaults — brute force, no
  quantization or partitioning.
- **No golden vectors.** Conformance checks shape, norm, determinism and
  role-sensitivity, all within one process. A tokenizer or quantization change
  that shifted every vector consistently would pass.

---

## phase-6b — The knowledge plane answers, and refuses when it should not

**2026-08-29** · **Commit** `97e6a17` · **Tag** `phase-6b`

**Roadmap** — Topic 5 (*Retrieval / knowledge*), completed: the full write path,
the read path, and an agent in front of it. Also topic 2 (*Tool use*), by way of
`search_knowledge`, and topic 8 (*Observability*) through the durable ingest
events.
**Phase** — §13 phase 6b, "Knowledge plane".

**Demonstrable**

```bash
pnpm models:acquire                                      # 331 MB, once
node --import tsx/esm examples/knowledge-demo/demo.mts    # the plane
node --import tsx/esm examples/knowledge-demo/agent.mts   # the agent
```

The plane demo ingests this repository's own documentation — ~400 chunks in
~20 s — and then does six more things, each a claim about a different part of
§5: retrieval across languages; a second ingest that skips every document by
content hash in 10 ms; a document that shrinks having its orphaned chunks swept;
a chunker change that re-chunks; an embedder change that reads 603 chunks back
out of the previous generation and never touches the corpus; and a query against
a stale index that refuses rather than answering.

The agent demo is the phase's end condition. `agent.yml` is three rows: the
phase-2/3 agent spine included unchanged, the knowledge plane included
unchanged, and one tool joining them.

**Packages**

Eleven of ours; nothing new vendored (still 150).

| Package | What it does |
|---|---|
| `@se373/digest` | one canonical SHA-256, shared so four stages cannot canonicalize differently |
| `@se373/corpus` | the `ctx.corpusSources` seam and the content hash incremental ingest turns on |
| `@se373/corpus-fs` | walks a directory tree; the shipped provider |
| `@se373/chunker` | the `ctx.chunker` seam, one key scheme, and the recursive splitter both providers share |
| `@se373/chunker-recursive` | format-agnostic character splitting |
| `@se373/chunker-markdown` | heading-aware; the heading travels with the chunk |
| `@se373/rerank` | the `ctx.reranker` seam — the one stage that is not index-invalidating |
| `@se373/rerank-none` | vector order, top-k; the defaulted tier |
| `@se373/knowledge` | `ctx.knowledgePipeline`: the generation key, the cascade, incremental ingest, retrieval |
| `@se373/knowledge-dedup` | the post-retrieve waterfall's one shipped listener |
| `@se373/tool-knowledge-search` | `search_knowledge`, injecting the pipeline and nothing else (§5.6) |

**§5.5 implemented rather than paraphrased.** The generation key digests all
four write-path stages; `firstDivergence` walks them in cascade order; the
rebuild plan is derived from position rather than written out per stage, so the
table and the code cannot drift. Retrieval fails closed on a mismatch, naming
both keys and the plan.

**Three bugs found by reading output, not by reasoning about code.**

The Markdown chunker prepended a section's heading and *then* split, so a long
section could emit a span consisting of the heading alone — maximum title
signal, zero information — which then attracted every query whose words
resembled that heading. Both instances in practice were `Known Limitations and
Deferred Work`, which every README in this repository has.

`tool-graph-inspect`'s invariant asserted as soon as `ctx.tools` was active,
which is not the same moment as its subject having registered: a loader group
applies its entries with `Promise.allSettled`. It passed for two phases on
ordering luck and failed the first time a sibling subtree did enough async work
to shift the interleaving. It is now keyed to its subject's own lifecycle on the
runtime graph. A false alarm is worse than no alarm, because it teaches people
to ignore the mechanism.

Retrieval returned one document said five ways, which is why `knowledge-dedup`
exists — and why the post-retrieve waterfall now has a real listener rather than
a declaration.

**The finding worth keeping.** Fifteen mutations, fifteen caught — but the first
pass caught eleven, and only two of the four misses were weak *tests*. The other
two were weak **mutations**: they named a bug they did not actually reproduce.
One changed the input to a split without changing the per-span prepend, so every
chunk still carried its heading; the other added an unused key to a fixture
instead of perturbing a compared vector. A mutation that fails to fail proves
nothing until you have checked it changes behaviour at all — which is the same
mistake as a test that passes for the wrong reason, one level up.

**Not yet**

- **No approval gate.** §5.5 requires a destructive change to be plan-gated,
  stating which stages rebuild and how long it will take. `status()` returns
  everything such a card needs; nothing presents it and nothing blocks on it.
  That is the builder plane's job.
- **A store-schema change re-embeds.** The cascade table says it should only
  rewrite, but `scan` returns chunks without vectors, so there is nothing to
  copy forward. The plan reports the spec; the executor does more.
- **Incremental ingest scans the whole index first** and writes into the live
  generation. A crash mid-ingest leaves it partially updated — defensible, since
  a content update is not a configuration change and re-running converges, but
  it is not atomic and nothing reports the gap.
- **Cross-lingual retrieval is uneven, and the demo shows it failing.**
  `Cordis là gì?` returns the same top passages as its English equivalent;
  `Tại sao chỉ số lỗi thời…` does not, because the corpus has no Vietnamese and
  the question is an ad-hoc translation of domain jargon. That is the concrete
  reason D6 wants a Vietnamese question set somebody wrote.
- **Near-duplicates across *different* documents are untouched.** Dedup is
  exact-match on document id; the identical `Known Limitations` heading in
  sixteen READMEs is a retrieval attractor that no listener addresses.
- **No ingest tool.** The model can search but cannot build, refresh, or ask
  whether an index exists.
- **`ingest/*` events are not rendered.** §5.4 calls for one Chat node via a
  `ConversationNodeDefinition`; the events carry everything it needs and nothing
  consumes them but the demo's own console.
