# Vendored Framework Surface

The nine packages under `vendor/` are the framework. We do not rewrite them, so
this file is how the team learns them: what each does, what it depends on, and
the shapes crossing its boundary.

Provenance, modifications, and the sync procedure are in [PORTING.md](PORTING.md).
This file is about **use**.

## The load order

```
cosmokit ──┐
           ├─→ cordis ──→ plugin-loader ──→ plugin-include ──→ your rows
schemastery┘                    │
                                ├──→ plugin-group   (nested row lists)
                                ├──→ plugin-timer   (disposable timers)
                                ├──→ plugin-hmr     (reload, phase 6d)
                                └──→ plugin-logger-console (an exporter)
```

---

## `@se373/cordis` — the runtime

**What it does.** Provides the object every other package hangs off: a
`Context` that carries services, an event bus, and a `Fiber` that owns a
plugin's lifetime. Its one hard rule is that registration returns a disposer,
so unloading a plugin removes everything it added. That rule is invariant I6.

**Depends on** `cosmokit` (small utilities), `@standard-schema/spec` (types only).

**In / out**

| Boundary | Shape |
|---|---|
| `new Context()` | the root context; `ctx.baseUrl` sets relative-specifier resolution |
| `ctx.plugin(fn \| class, config?)` | → `Fiber & PromiseLike<Fiber>`; `await` it to join activation, `.dispose()` to unload |
| `ctx.effect(setup, label?)` | `setup` returns a disposer (or a generator yielding disposers) → returns that disposer |
| `ctx.inject(names[], fn)` | runs `fn` only while every named service is present; re-runs on replacement |
| `class X extends Service` | `super(ctx, 'name')` publishes `ctx.name`; unpublished automatically on unload |
| `[Service.init]()` | lifecycle hook; as an async generator, every `yield`ed disposer runs on teardown in reverse |
| `ctx.on(event, listener, opts?)` | → disposer. Dispatch modes: parallel, serial (bail), **waterfall** (`(...args, next)` around-middleware) |
| `ctx.logger('<pkg>')` | → `Logger` with `.info/.warn/.error/.debug`; **writes only to registered exporters** |

**Gotcha we already hit.** A logger with no exporter mounted silently drops
messages. The console exporter is a plugin, so anything logged before it
activates — or after it unloads — is lost. `@se373/cli` mounts the exporter on
the root context for exactly this reason.

---

## `@se373/cordis-plugin-loader` — config rows become a live tree

**What it does.** Turns a list of `{ id, name, config }` rows into mounted
plugins, and keeps them in sync when the list changes. This is the mechanism
behind invariant I3: swapping a stage is an edit to a row, not to code.

**Depends on** `cordis`, `cosmokit`, `node-addon-require-builtin` (peer).

**In / out**

| Boundary | Shape |
|---|---|
| `ctx.plugin(Loader, { baseUrl? })` | publishes `ctx.loader` |
| **a config row** | `{ id: string, name: string, config?: any, group?: boolean, disabled?: boolean, inject?: Inject }` |
| `ctx.loader.create(options, parent?, position?)` | → `Promise<string>` — the **entry id**, not a fiber |
| `ctx.loader.remove(id)` | → `Promise<void>`; unloads the entry and its descendants |
| `ctx.loader.store` | `Dict<Entry>` — the live tree, keyed by id |

`name` is a module specifier resolved against `ctx.baseUrl`, so plugin
resolution follows ordinary Node rules from that directory.

---

## `@se373/cordis-plugin-include` — a config *file* becomes a subtree

**What it does.** Reads a YAML/JSON row list from disk, mounts it as a subtree,
and applies patch overlays. Patches are how a bundle's defaults get overridden
without editing the bundle.

**Depends on** `cordis`, `cosmokit`, `js-yaml`, `plugin-loader` (peer).

**In / out**

| Boundary | Shape |
|---|---|
| config | `{ path: string, initial?: any[], patches?: PatchOptions[], enableLogs?: boolean }` |
| `path` | resolved from `ctx.baseUrl`; the file holds a row list |
| patches | applied after reading; a patch **replaces the targeted row's whole `config`** |
| writes back | row edits (e.g. `disabled`) are persisted to the file, debounced |

A patch cannot cross an include boundary — it only reaches rows at its own
level. This matters when composing bundles.

---

## `@se373/cordis-plugin-group` — nested row lists

**What it does.** Lets one row contain a list of rows, so a tree has depth.
Updates are transactional: sibling rows start concurrently, and a failure rolls
the group back rather than leaving half a tree mounted.

**Depends on** `cordis`, `plugin-loader` (peer).

**In / out** — a row with `group: true`; its `config` is the child row list.

**Consequence worth knowing.** Because a group starts its rows *concurrently*,
one row cannot assume another has activated. Anything order-dependent must use
`ctx.inject`, not row position.

---

## `@se373/cordis-plugin-timer` — timers that unload

**What it does.** Wraps `setTimeout`/`setInterval` so each one is an effect
owned by the calling fiber. A plugin that uses `ctx.setInterval` cannot leak a
timer past its own unload; a bare `setInterval` can.

**Depends on** `cordis`, `cosmokit`.

**In / out** — publishes `ctx.setTimeout`, `ctx.setInterval`, `ctx.sleep`,
`ctx.throttle`, `ctx.debounce`. Each returns a disposer (or a callable carrying
`.dispose`).

---

## `@se373/cordis-plugin-logger-console` — an exporter

**What it does.** Registers a console exporter on the logger service, with
per-package levels. Section 11.2 of the architecture doc leans on this: a noisy
package is turned up by config, never by editing its source.

**Depends on** `cordis`, `cosmokit`, `schemastery`, `supports-color`.

**In / out**

| Boundary | Shape |
|---|---|
| config | `{ colors?, maxLength?, levels?: Record<string, number>, showDiff?, showTime?, label? }` |
| `levels` | `{ default: 2, 'vector-store': 3 }` — key is the logger namespace |
| levels | 0 silent · 1 error · 2 info · 3 debug |

---

## `@se373/cordis-plugin-hmr` — reload (not used yet)

**What it does.** Watches a root directory and swaps changed plugins in place,
propagating accept/decline up the dependent graph. Any throw during re-import
calls `rollback()`, so a broken plugin cannot take the process down. Phase 6d
builds a staging gate *around* this; we do not build reload itself.

**Depends on** `cordis`, `cosmokit`, `schemastery`, `chokidar`, `picomatch`,
`@babel/code-frame`, `plugin-timer`/`plugin-loader`/`plugin-include` (peer).

**In / out**

| Boundary | Shape |
|---|---|
| config | `{ base?: string, root: string[], ignored: string[], debounce: number }` |
| `root` | watched directories; **defaults to `['.']`** |
| emits | `hmr/reload` after a successful swap |
| requires | Node's internal module loader — a bundled or SEA build may not qualify |

Two properties phase 6d depends on: config and entry identity survive a swap,
and a failed reload is atomic.

---

## `@se373/schemastery` — config schemas

**What it does.** Declares and validates a plugin's config, and supplies
defaults. A `static Config` on a service is what makes a config row checkable
rather than hopeful.

**Depends on** `cosmokit`, `@standard-schema/spec`.

**In / out** — `z.object({ … })` → a schema that is also a validator function;
`z.string()`, `z.natural()`, `z.array()`, `.default(v)`, `.role('ms')`.
Roles drive form rendering later (§7.1's manifest-driven config cards).

---

## `@se373/cosmokit` — small utilities

**What it does.** Zero-dependency helpers the rest of the framework shares:
`defineProperty`, `Dict`, `isNullable`, array/string/time helpers. Nothing to
learn; listed because everything imports it.

**Depends on** nothing.

---

## Known Limitations and Deferred Work

- `plugin-hmr` is vendored but never mounted. It has no coverage in this repo
  until phase 6d.
- `plugin-group` and `plugin-timer` are declared in `examples/package.json` for
  resolution but are only lightly exercised.
- This file documents the surfaces we use. Cordis has more (`ctx.reflect`,
  isolate realms, `internal/*` events); isolate realms become load-bearing at
  §6.3 and should get a section then.
