# @se373/system-blocks

## What it does

Registers the packages this harness ships as blocks, so the cookbook has
something to resolve against.

**One file for all of them, which §6.1 says should be one file per block.** That
is a deliberate shortcut with a cost: a manifest here can drift from the package
it describes, and nothing but this package's own tests would notice. The reason
to accept it now is that the alternative — sixteen packages each gaining a
manifest and a registration row — is a change to sixteen packages in service of a
registry that had not yet been used for anything. When authoring lands at 6d and
forks start naming parents, the manifests move to their packages and this file
becomes the seed for the vendored ones only.

Tiers are I2's, and the tier is what decides what a fabricated agent can do on
arrival: `ready` and `defaulted` blocks run; `blocked` blocks mount inert and say
what they need.

## Depends on

`@se373/block-registry` (injected as `ctx.blocks`), `@se373/runtime-graph`,
`@se373/cordis`. It imports none of the packages it describes — a manifest is
data about a plugin, not a reference to it, which is also why it can describe a
vendored package without depending on it.

## In / out

**In.** Nothing configurable. It is a row, so disabling it leaves a working
repository with recipes that resolve to nothing — a legitimate configuration and
exactly what a plan's warnings are for.

**Out.** Sixteen `origin: 'system'` blocks: six tools, the knowledge write path
in cascade order, the read path, and one genuinely blocked block.

| Tier | Blocks |
|---|---|
| `ready` | the six tools, `chunker-markdown`, `chunker-recursive`, `rerank-none`, `knowledge-dedup`, `knowledge` |
| `defaulted` | `model-registry`, `corpus-fs`, `embedder-onnx-local`, `vs-sqlite-vec` |
| `blocked` | `mcp-client` — it needs a server to talk to |

## Known Limitations and Deferred Work

- **Manifests can drift from their packages** and nothing detects it. A changed
  `inject` list here produces a plan warning that is wrong in either direction:
  a missing entry hides a row that will not start, and a spurious one warns about
  a row that would have been fine.
- **`inject` lists are hand-written**, not read from each package's `inject`
  export, which is the obvious fix and needs the manifests to live with their
  packages first.
- **Not every shipped package has a block.** The runtime and web-plane packages
  are absent because no recipe composes them; the list grew from what the
  cookbook needed.
- **`defaults` are minimal.** `corpus-fs` defaults to `docs`, which is right for
  this repository and arbitrary anywhere else.
