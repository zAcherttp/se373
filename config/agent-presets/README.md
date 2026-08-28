# agent-presets

The shipped preset roster. One directory per preset, each holding an
`agent.cordis.yml` (the composition) and a `preset.yml` (name, description,
order). `examples/web/cordis.yml` points `@se373/agent-presets` here with
`trust: system`, which marks the root read-only; a copy made from the UI lands
in `$SE373_HOME/.agent-presets` instead.

| Preset | |
|---|---|
| `standard` | The full coding agent. Transcribed from dsh's own `standard`, restricted to what we vendor |
| `inspect` | Ours. Reads and searches, inspects the runtime, and cannot change anything |

## What a preset owns, and what it must not

A preset is an **agent-plane** composition. The roster mounts it once per
process under a standing scope, and every session naming it joins by scope
parentage — so the tools and prompt sections registered here cover each joined
agent while a session's own state stays keyed per Session/Agent inside the
plugins.

The host composition keeps everything a preset must not own: the registries
themselves, the sandbox and approval stack, persistence, and the model route.
The criterion is not taste. A row belongs to the host when something outside any
preset realm has to read its service — `subagents` is a process singleton the
api-proxy serves to the browser, `goals` resolves on the host because the
gateway serves it as a Remote, and the token meter owns projection units that
would come and go with whichever presets happened to be mounted.

**A service row here must sit inside a group carrying an `isolate` realm.**
Without one it publishes into the root realm, where it is process-global;
another preset publishing the same name collides, and `agent-presets` rejects
that at mount.

## Absent is not the same as denied

`inspect` is the clearest case, and the distinction is worth stating because it
is easy to write a preset that promises the first and delivers the second.

- **Absent** — the shell, delegation, skills, goals and todos are not composed.
  They are not in the catalog the model is shown, so there is nothing to call.
  That is stronger than a permission mode: `workspace-write` still puts `bash`
  in front of the model and asks a human when it fires.
- **Denied** — file writing. `tool-fs` registers `read`, `write` and `edit` as
  one suite with no read-only switch, so the guarantee has to come from
  underneath: the preset shadows `fs` and `sandboxPolicy` in its own realm with
  a read-only policy, and a write is refused at the boundary.

The persona says which is which. An agent told it cannot do something it can see
in its own catalog will try anyway.

## Known Limitations and Deferred Work

- **Presets are mounted by the gateway, so they are a web-plane feature here.**
  `host-apiproxy` composes an agent from a preset when a session is created;
  `examples/chat/cordis.yml` creates its agent through the headless runner
  instead, so that tree keeps its tools on the host plane.
- **`plan-mode` is absent from both.** Its whole configuration is the prompt
  section it injects, and that section is upstream's product writing rather than
  a default we can supply.
- **`standard` is smaller than upstream's.** No `tool-pwsh`, `tool-web`,
  `tool-ralph`, `repeat-tool-reminder`, or the workflow engine — each is a
  seed-list edit away, not a design question.
- **Neither preset is exercised by a test.** They are checked by booting and
  reading the composed catalog.
