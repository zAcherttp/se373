# subagent-demo

The phase-5 demonstrable: an agent delegates, and a child agent runs.

```bash
pnpm build
node --import tsx/esm examples/subagent-demo/demo.mts
```

Exits `0` on `PASS`. No API key: the mock provider supplies the *decision* to
delegate, which is the one thing a key would otherwise be buying.

It boots **`examples/web/cordis.yml`** — the tree that ships — and then talks to
it the way the browser does: over `/api`, through the browser-trust fence, with
a session the gateway composes from a preset. Everything between the prompt and
the child settling is real.

The output names all three links in the chain:

```
preset  standard
children: 1
  2dd47ee0-…  mode=one-shot activity=inactive label="count the runtime rows"
parent transcript: 36 events
  tool/call    subagent
  tool/result  "Delegated and done."
```

The `label` is the description the parent's tool call carried, so it is evidence
the delegation reached the child rather than a coincidence of naming.

## Why it goes over HTTP

This is a lot of ceremony next to [`graph-demo`](../graph-demo/README.md), and
the reason is a finding worth stating: **presets are mounted by the gateway**, at
session creation. A headless script that builds its own agent gets no preset —
and since phase 5 moved every model-facing row onto the agent plane, the global
tool layer is empty. An agent with no preset has no tools at all.

So the demonstrable has to create its session the way a client does. Node's
`fetch` sends `Host: 127.0.0.1:<port>` and no `Origin`, which is exactly what
the trust fence wants.

## Known Limitations and Deferred Work

- **The model is a fixture.** The mock is told to call `subagent`. This shows the
  delegation machinery works end to end, not that a model chooses to delegate
  well.
- **The child's own transcript is not read.** The gateway serves the sessions a
  client owns and a subagent belongs to its parent, so the evidence here is the
  registry row plus the parent's `tool/call` and `tool/result`. Reading the
  child's log means going to persistence directly.
- **One child, one shot.** `subagent_fork`, background mode, `list_agents` and
  `interrupt_agent` are all composed in the `standard` preset and none is
  exercised here.
- **`SE373_PERMISSION_MODE=danger-full-access` is set by the script**, because a
  delegated turn runs tools with nobody at the keyboard.
