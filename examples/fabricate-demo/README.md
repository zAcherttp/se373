# fabricate-demo — phase 6d, step 2

A fabricated agent is an *agent*: its own persona, its own tools, its own
filesystem posture, and you talk to it.

```bash
pnpm models:acquire                                      # 331 MB, once
node --import tsx/esm examples/fabricate-demo/demo.mts
```

Two agents fabricate into one process:

| | internal-knowledge | code-review-agent |
|---|---|---|
| subsystem rows | 8 (the whole knowledge plane) | 0 |
| agent rows | `search_knowledge` | `tool-fs`, `tool-fs-search` |
| filesystem | none | **read-only**, pointed at this repository |
| catalog it presents | `search_knowledge` | `edit, glob, grep, read, write` |

The catalogs are the proof of scoping: each agent presents exactly its own
preset's tools (read off the requests the mock LLM records), and neither sees
the other's. `write` **is** in the reviewer's catalog — present-and-refused is
the `inspect` posture, and its persona says so. The main roster still lists
exactly `inspect, standard`: the fabricated personas exist only where their
agents do.

Two at once is what makes the isolation guard non-theoretical: two rosters named
`agentPresets`, two seam sets, one process, no collision — and the first run of
this demo is what caught the `settings`-namespace collision that `settings`
isolation now prevents.

The whole path is real except the model: sessions are created the way the
gateway creates them, presets mount through upstream's own roster, the ingest is
gated and approved, and the retrieved passages are real. The mock supplies only
the decisions.

## What the demo does *not* prove

The read-only **enforcement** is upstream's `fs-sandbox`, tested upstream. Ours
is the generated composition — the realm group, its two isolates, the
workspaceRoot — which `tests/preset.spec.ts` pins. Preset compositions are
standing plugin mounts, not loader rows, so they are invisible to the runtime
graph; the demo prints where the generated file lives instead of pretending to
show it on the graph.

## The spine

`spine.yml` is `examples/chat/cordis.yml` transcribed minus the one-shot driver
and minus the host-plane tool rows. The first run of this demo showed both
agents presenting `bash, read, write, …` — the chat tree's host-plane tools,
visible to every agent through the global layer. In this demo every tool an
agent has arrives through its fabricated preset, which is the claim; the
*services* those tools sit on (fs, bash, sandbox, subprocess) stay, exactly as
the web tree keeps them under the preset roster.
