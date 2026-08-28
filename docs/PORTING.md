# Porting & Provenance

Every file in this repository is one of three things. This document says which,
and for anything copied, where it came from and what we changed.

| Origin | Where | Notice |
|---|---|---|
| **Vendored framework** — copied, rescoped, otherwise upstream | `vendor/*` | upstream MIT `LICENSE` preserved in each directory |
| **Ported** — studied upstream, rewritten smaller by us | `packages/*` (marked below) | credited per row |
| **Ours** — written for this project | everything else | — |

> **MIT grants use, copying, and modification** — the whole vendored set is
> free to take, provided the notices travel with it, which they do. This file
> is not a permission record; it is an engineering one. It tells you which
> files you may edit freely, which ones will be overwritten by the next
> upstream sync, and what our local divergences are.

---

## 1. Vendored framework (`vendor/`)

Copied from the **DeepSeek Harness** working tree at `b150a551` (v0.1.1-rc.2),
which had in turn vendored them from Cordis upstream. So there are **two** layers of prior
work here, and both are MIT:

- **Cordis and its plugins** — © Shigma and contributors, `cordiverse/cordis`
- **DeepSeek Harness's modifications to them** — © DeepSeek, `deepseek-ai/deepseek-harness`

| Directory | Our name | Upstream name | Version | Upstream source |
|---|---|---|---|---|
> **Corrected 2026-08-27.** This section previously recorded `47f94385`. The
> clone is at `b150a551` with a clean tree, and all 31 vendored framework source
> files are byte-identical to it once the rescope is applied — so the tree never
> came from `47f94385`, and the "expect drift between doc and code" caveat this
> file used to carry was describing a problem that did not exist. The per-package
> provenance in §3 is the fix: the rev now lives in the tree, where it can be
> checked, rather than in prose, where it cannot.

| `cordis/` | `@se373/cordis` | `cordis` | 4.0.0-rc.7 | cordiverse/cordis `packages/core` @ `56b3d4f7` |
| `cosmokit/` | `@se373/cosmokit` | `cosmokit` | 1.8.1 | deepseek-harness/cosmokit @ `16f6fc05` |
| `schemastery/` | `@se373/schemastery` | `schemastery` | 3.18.0 | deepseek-harness/schemastery @ `e67cee00` |
| `loader/` | `@se373/cordis-plugin-loader` | `@cordisjs/plugin-loader` | 1.0.0-rc.5 | cordiverse/cordis `packages/loader` @ `56b3d4f7` |
| `include/` | `@se373/cordis-plugin-include` | `@cordisjs/plugin-include` | 1.0.4 | deepseek-harness/cordis @ `abb0a307` |
| `group/` | `@se373/cordis-plugin-group` | `@cordisjs/plugin-group` | 1.0.0 | deepseek-harness/cordis @ `abb0a307` |
| `timer/` | `@se373/cordis-plugin-timer` | `@cordisjs/plugin-timer` | 1.1.2 | deepseek-harness/cordis @ `abb0a307` |
| `hmr/` | `@se373/cordis-plugin-hmr` | `@cordisjs/plugin-hmr` | 1.0.15 | deepseek-harness/cordis @ `abb0a307` |
| `logger-console/` | `@se373/cordis-plugin-logger-console` | `@cordisjs/plugin-logger-console` | 1.0.0 | deepseek-harness/cordis @ `abb0a307` |

### Why vendored rather than installed from npm

Every package above **is published on npm at the same version number**, and
those published copies **differ in content**. dsh carries 18 logged local
modifications; four are behavioral and land on machinery this project depends
on:

| dsh modification | What it fixes | Why we need it |
|---|---|---|
| `cordis/src/fiber.ts` lifecycle hardening | reentrant disposal gaps; rejects effect creation while `UNLOADING` | **I6** — every registration is a reversible effect |
| transactional Loader/Include reconciliation | rollback when a config candidate fails to apply | **I3** — a stage swap is a config-row edit |
| lazy Loader config resolution (cordiverse/cordis#41) | raw config resolved only after declared injections are active | **I3**, and `!!js` rows generally |
| `hmr` exact-config watching + initial-scan suppression | a boot deadlock that exited 13 with no diagnostic | **§6.6** — the staging gate, phase 6d |

Verified directly against the registry: `cordis@4.0.0-rc.8` contains **no
`internal/config`** (the lazy-resolution mechanism) and carries fewer
`UNLOADING` guards than the vendored `fiber.ts`. A `pnpm add` would silently
install the unpatched build, because the version number matches.

**The trap to remember:** matching version numbers do not mean matching
content. Never "upgrade" a vendored package by installing the npm copy.

### Our modifications on top

Keep this log exhaustive.

1. **Rescope `@deepseek-ai/*` → `@se373/*`** across every manifest `name`,
   internal dependency entry, and module specifier. Directory names, version
   numbers, and dependency ranges are unchanged. No upstream *runtime*
   identifier is renamed — `Symbol.for('cordis.*')` and Schemastery's
   `vendor:` metadata keep their upstream values. Same rationale as dsh's own
   rescope: publishing under `cordis` / `@cordisjs/*` would squat upstream
   names.

2. **`exports` repointed to source.** `main`/`exports.default` now name
   `src/*.ts`; `types` still names the built `lib/types/*.d.ts`. We run under
   `tsx` rather than building, so the runtime loads source, while the
   typechecker reads generated declarations and never pulls vendored sources
   (with their relaxed strictness) into our program. `files` and
   `publishConfig` were dropped and `private: true` set — nothing here is
   published.

3. **`tsconfig.json` in each package** now extends `tsconfig.vendor.base.json`
   instead of dsh's root base. Per-package strictness relaxations are unchanged
   from dsh.

4. **`hmr/package.json` declares `@se373/cordis-plugin-loader` and
   `@se373/cordis-plugin-include`.** `hmr/src/index.ts` imports both, but
   neither was declared; dsh's repo-wide `paths` facade resolved them anyway,
   so the gap was invisible there. Manifest-only; no source change.

5. **Not copied:** `tsdown.config.ts` (we do not bundle), `lib/` build output,
   and dsh's `README.md` build-shape notes.

### Sync procedure

1. Note the source commit in the dsh working tree.
2. Copy `src/` (plus `bin.js`, `LICENSE`, `README.md` if changed).
3. Re-apply every modification above, or drop it — update this log either way.
4. Update the version and commit in the table.
5. `pnpm install && npx tsc -b tsconfig.host.json && npx vitest run`.

---

## 2. Vendoring scope — dsh's baseline is the baseline

Settled 2026-08-26, revised the same day after measuring it.

**We take dsh's own bundles.** `bundle/base` is dsh's answer to "what does a
working harness need", and that answer is the thing SE373 calls the Harness.
Curating our own subset means re-deciding, worse, a question upstream already
answered.

| Take | Closure | When |
|---|---|---|
| `bundle/base` | 123 | the harness itself |
| `+ bundle/headless` | 126 | phase 2–3 — terminal chat |
| `+ bundle/web-app` | 174 | phase 4 — the web plane |
| `+ 13 named extras` | **187** | see below |

**187 of 227 taken; 40 excluded.**

### The extras

Thirteen packages the bundles cannot reach, because they are pulled by the
frontend build or by an entrypoint rather than by a plugin row:
`mcp-client`, `sdk/client`, `sdk/protocol`, `client/ui-slots`,
`client/ui-primitives`, `client/web`, `extensions/tool-cordis`,
`interaction/tool-ask-user`, `storage-sqlite`, `core/agent-tool-presentation`,
`preset/persona`, `web/web-fetch-http`, `session-persistence-sqlite`.

### The exclusions

Forty packages, and every one is excluded for the same reason: it needs
**external infrastructure or another vendor's protocol**, not because we judged
it unnecessary.

| Excluded | Why |
|---|---|
| `e2b/*`, `code-runtime-python` | remote sandbox service |
| `acp/*`, `subagent-{acp,claude-code,codex,dsh-sdk}`, `hooks-{claude-code,codex}` | other vendors' agent protocols |
| `lsp/*` | language-server infrastructure |
| `terminal/*`, `tool-*-persistent` | PTY (`node-pty` native build) |
| `web-search-{exa,perplexity}` | third-party search API keys |
| `test-support/*`, `examples/*`, `experimental/*` | upstream's own dev infrastructure |
| `typert/generator`, `sdk/server`, `schedule`, `tool-session-query`, `time-context`, `tmux-context`, `session-title-all-prompts-llm` | no consumer in our tree |

### Anything else we do not want is a disabled row, not an exclusion

This is the part worth internalising. A vendored package that we do not want
running is **`disabled: true` in a config row** — invariant I3, one line, and
reversible when a demo needs it. Vendoring is not endorsement, and excluding at
vendor time throws away optionality for no gain.

### Third-party npm dependencies

48 across the taken set, including `react`, `react-dom`, `zod`, `chokidar`,
`shiki`, `ws`, `@modelcontextprotocol/sdk`, `@vscode/ripgrep`, `sharp`, and the
OpenTelemetry exporters. Each needs an `allowBuilds` review in
`pnpm-workspace.yaml` before install. Dropping `node-pty` is most of why the
PTY packages are excluded.

### Where the actual work is

The vendored spine is the floor, not the deliverable. L3 and L4 — the knowledge
and builder planes, which *are* the project — have **no upstream analogue at
all**. Nothing in dsh corresponds to `ctx.embedder`, `ctx.chunker`,
`ctx.vectorStore`, `ctx.blocks`, `ctx.retrievalEval`, or `ctx.promotion`.

---

## 3. Vendored harness (`vendor/dsh/`)

The framework in §1 is nine packages copied by hand. The harness is 187, and
copying those by hand would be a full-time job that goes stale the first time
upstream moves. So this half is **a script**: `scripts/vendor-dsh.mjs`.

```bash
node scripts/vendor-dsh.mjs --list agent-loop llm-deepseek headless   # report only
node scripts/vendor-dsh.mjs agent-loop llm-deepseek headless          # do it
```

Seeds name upstream packages without their scope or `dsh-` prefix. The script
walks the declared dependency closure, so naming a bundle or an entrypoint
brings everything under it.

### Layout

`vendor/dsh/<group>/<package>` mirrors upstream's own `packages/<group>/<package>`
exactly, which is what makes a re-sync a per-path copy rather than a diff hunt.
The three-way split of this repository reads off the tree:

| Path | Origin |
|---|---|
| `vendor/*` | the Cordis framework — §1 |
| `vendor/dsh/*/*` | the DeepSeek Harness — this section |
| `packages/`, `apps/`, `examples/` | ours |

`git diff --stat packages apps` therefore shows our work and nothing else.

### What the script transforms

| Transformation | Why |
|---|---|
| `@deepseek-ai/dsh-X` → `@se373/X`, `@deepseek-ai/Y` → `@se373/Y`, in manifests **and** sources | same rationale as §1: publishing under upstream's names would squat them. The rename table is built from the upstream manifest set, so a name that is not a workspace package (`@deepseek-ai/node-addon-landlock-run`) is left alone |
| `main` / `exports.*.default` → `src/*.ts`; `types` stays on `lib/types/*.d.ts` | we run under `tsx` and never build. Runtime loads source; the typechecker reads generated declarations and never pulls relaxed-strictness sources into our program |
| `publishConfig` and `files` dropped, `private: true` set | nothing here is published |
| every `tsconfig*.json` **copied**, with `extends` and `references` remapped onto our layout | see "Why the tsconfigs are vendored" below. Test globs and non-`src` `files` entries are dropped, because we do not copy `tests/` and an `include` that matches nothing is a hard tsc error |
| `exports["./client"]` left pointing at `lib/client.js` | the host half runs from source; the browser half cannot. `client-modules` resolves this condition, `readFileSync`s the result to hash it, and serves those bytes to a browser — TSX would not survive the trip, and a missing artifact is a fatal activation error rather than a degradation |
| `exports` under `./lib/types/` rewritten by stripping that whole prefix | `lib/types` is the declaration output dir, so `./lib/types/types.js` is the emit of `src/types.ts`, not of `src/types/types.ts`. Stripping only `./lib/` pointed those exports one directory too deep |
| `tsdown.config.ts` copied beside `src/` | a UI plugin's browser artifact is built, not run; the config is where the package states its entries |
| workspace `devDependencies` outside the closure are dropped | upstream devDeps carry test-only packages; we do not copy `tests/`, so pnpm would fail to link them. Each drop is reported |
| `README.md` and `cordis.patch.yml` copied beside `src/` | this is the per-package documentation the working rules require — upstream already wrote it |
| an `se373.upstream` block written into every manifest | see below |

`README.i18n.yaml`, `README.zh.md`, `lib/`, and `tests/` are not copied.

### Why the tsconfigs are vendored rather than generated

Phases 1–3 generated each package's `tsconfig.json` from its manifest's
workspace dependencies. That does not survive the browser half.

Upstream splits a package that has **both faces** into `tsconfig.host.json` and
`tsconfig.client.json` with a solution file over them, and those reference lists
are hand-curated so the two programs stay acyclic. Deriving references from
manifests produced a genuine cycle the moment the client packages arrived —
`api/gateway → client/connection → host/apiproxy → api/remotes` — because a
devDependency edge that is perfectly fine for npm is a cycle for `tsc -b`.

So the tsconfigs are vendored for the same reason the sources are: **the
curation is the value, and we cannot re-derive it.** The script remaps
`extends` and `references` from upstream's layout onto ours (one level deeper
under `vendor/dsh`, framework under `vendor/`, root bases renamed) and drops any
reference to a package outside our closure.

The two solution files follow from the same source. `tsconfig.host.json` and
`tsconfig.vendor.client.json` take their membership from upstream's own
`tsconfig.host.json` and `tsconfig.client.json`, filtered to what we vendored.
The host solution additionally takes every vendored package the browser plane
does not claim: upstream reaches many of ours only through `apps/cli` and
`bundle/base`, neither of which we vendor, so a straight filter would leave the
phase-2 and phase-3 rows in no program at all.

This paid immediately. The vendor build had been exiting `2` with ~447 errors
since phase 1 — 236 in `vendor/schemastery`, 25 in `vendor/loader` — and
emitting anyway. On upstream's own tsconfigs it exits `0`.

### Shared files

Some upstream files belong to a whole package group rather than to one package,
so the dependency closure never reaches them. They are listed in the script's
`SHARED_FILES` table with their own layout rewrites, each a hard failure when it
stops matching.

| File | Why it comes along |
|---|---|
| `packages/client/tsdown.client.ts` → `vendor/dsh/client/tsdown.client.ts` | the browser build preset every UI plugin's three-line `tsdown.config.ts` calls into. The module-table externals, the bundle purity gate, the CSS pipeline and the `__ModuleLoader__` handoff are all decided here — far too load-bearing to reimplement |

### The source-resolution facade

`tsconfig.vendor.paths.json` is generated by the script and extended by both
vendored bases. Our own program still has no `paths` — pnpm's links are the only
resolution there, so a package that forgets a dependency fails instead of
silently working. The vendored layer needs the opposite, and not by preference.

A vendored manifest points `types` at `lib/types/*.d.ts`. Inside one
compilation, `./runtime-types` (relative, source) and `@se373/agent` (package
name, declarations) then yield **two nominal identities for the same class** —
and a class with a private field is not assignable to its own twin. That is
precisely where the typert generator stopped on `core/agent`.

Upstream carries the same facade for the same reason; ours is generated from the
tree rather than hand-kept. Two details are worth knowing:

- **`./client` maps to source here, while `exports` names a built artifact.**
  Not a contradiction: `exports` is what Node and pnpm resolve at runtime,
  `paths` is what tsc resolves at compile time. The bundle must be a file on
  disk; the types need not be, and pointing them at source is what keeps one
  identity per class across the two planes.
- **`./typert` and `./remote` are absent** — they have no source to point at.

### Undeclared dependencies

Upstream can leave a **type-only** import undeclared, because its root
`tsconfig.base.json` carries a `paths` facade mapping every `@deepseek-ai/*`
name straight to source. We deliberately have no such facade: pnpm's workspace
links are the only resolution, so a package that forgets to declare a dependency
fails to resolve instead of silently working — the same discipline Cordis wants
from `inject`.

The cost is that upstream's undeclared edges have to be written down, in the
script's `EXTRA_DEPS` table.

| Package | Added | Why |
|---|---|---|
| `host/apiproxy` | `@se373/scope` | `import type { ScopeKey }` in `src/api-proxy.ts`, declared nowhere in the manifest |

### Provenance lives in the tree, not in this file

Every vendored manifest — harness and framework alike — carries:

```jsonc
"se373": {
  "upstream": {
    "repo": "deepseek-ai/deepseek-harness",
    "rev": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e",
    "path": "packages/llm/llm-deepseek",
    "name": "@deepseek-ai/dsh-llm-deepseek"
  }
}
```

The script stamps it on every write and marks the rev `-dirty` when the upstream
working tree is not clean. This exists because a single pin in prose does not
survive selective migration — and, as the correction in §1 records, did not even
survive being written down once.

**The sync policy this supports** (settled 2026-08-27): we neither freeze nor
track. When something upstream looks worth having, update the clone, read the
breaking changes, re-run the script for the affected seeds, and read the diff.
Re-vendoring regenerates every package it touches and hard-fails on any stale
`LOCAL_MODS` entry, so drift surfaces as a diff and divergence surfaces as a
crash. Per-package revs are what make *partial* migration expressible.

### Local modifications

Declared in the script's `LOCAL_MODS` table and re-applied on every sync. A
`from` that stops matching is a hard failure, not a silent skip: upstream moved
and the divergence needs re-deciding.

| # | Package | Change | Why |
|---|---|---|---|
| 6 | `util/home-paths` | `DSH_HOME_DIR_NAME`: `.dsh` → `.se373` | without it our tree reads and writes a co-installed dsh's sessions, settings, and credential store |
| 7 | `util/home-paths` | `DSH_HOME_ENV`: `DSH_HOME` → `SE373_HOME` | a dsh user pointing `$DSH_HOME` elsewhere must not drag our tree with it |
| 8 | `subprocess/subprocess` | `DSH_ENV_PREFIX`: `DSH_` → `SE373_` | the namespace the harness announces itself under inside child processes. A tool running under us should not report that it is inside dsh |
| 9 | `bundle/web-app` | `DSH_WEB_URL` → `SE373_WEB_URL` | fallout from 8, and the same argument: the bash variable naming the local Web GUI is a harness variable, and the agent must see one namespace rather than two |

Modification 8 was not a choice so much as a consequence, and it is worth
recording why. `shell-env` types its exported keys as
`` `${DSH_ENV_PREFIX}${string}` ``, so renaming the home variable in 7 made
`SE373_HOME` unassignable and the vendored build stopped compiling. The type
was upstream telling us the prefix is one namespace, not a spelling — moving
half of it was the actual error.

Numbering continues §1's list; both are one log.

**The key stayed upstream's.** `ctx.provide('dshHomePath', ...)` in
`apps/cli/src/boot.ts` keeps dsh's name even though it now resolves `~/.se373`,
because `!!js dshHomePath('sessions')` is what dsh's own patch YAML says — a row
transplants verbatim. The name is upstream's; the value is ours.

### Third-party npm dependencies

Each needs an `allowBuilds` review in `pnpm-workspace.yaml` before install. Two
are denied so far:

| Package | Verdict | Why |
|---|---|---|
| `esbuild` | denied | `vendor/hmr` imports only its `BuildFailure` *type* |
| `koffi` | denied | `session-persistence-jsonl/src/win32.ts` lazily loads it to call `kernel32.dll`. Never reached off Windows |
| `node-pty` | allowed | a top-level import in `subprocess-local`, which every shell tool runs through, and there is no second subprocess provider upstream |
| `@vscode/ripgrep` | allowed | its postinstall downloads the binary `tool-fs-search` shells out to. No binary, no grep or glob |
| `@modelcontextprotocol/sdk` | denied | neither it nor anything in its closure ships an install or postinstall script — the several `prepare` scripts in there are never run for a registry tarball. Recorded as an explicit deny rather than left undecided, because an undecided build is a boot that stops on a prompt |

### Deep imports into vendored source

Every vendored manifest exports `"./src/*": "./src/*"`. That is upstream's own
door for reuse below the package's public seam, and we use it in exactly one
place. It is recorded here because **a sync could move those files**, and a deep
import breaks silently at the next re-vendor rather than at review time.

| Importer | Imports | Why not reimplement |
|---|---|---|
| `@se373/logger-jsonl` | `session-persistence-jsonl/src/format.ts` → `logSuffix`, `JsonlCompression` | the `.jsonl` / `.jsonl.zstd` suffix rule, and the type that selects it |
| `@se373/logger-jsonl` | `session-persistence-jsonl/src/zstd.ts` → `compressZstdFrame`, `decompressZstdFrame`, `decompressZstdPrefix`, `scanZstdFrames` | a concatenated-frame container with structural scanning and torn-final-frame recovery. The torn path is the one that matters: it is what opens the log written by the crash under investigation |
| `@se373/logger-jsonl` | `session-persistence-jsonl/src/win32.ts` → `publishNewFileWin32`, `ensureDurableDirectoryWin32` | Windows has no parent-directory fsync contract through Node, so durable publication goes through `koffi` → `MoveFileExW(MOVEFILE_WRITE_THROUGH)`. This is the single most expensive thing in the vendored tree to rediscover |

`index.ts` and its `SessionPersistence` implementation are **not** reused: the
top layer is typed on `SessionEvent`, which is the wrong *type*, not the wrong
layer. The design note for this split is
[`docs/design/runtime-observability.md`](design/runtime-observability.md) §7.

The three imported modules know nothing about sessions, which is what makes the
reuse honest rather than a shortcut. A sync that moves or renames any of them
surfaces as a typecheck failure in `packages/runtime/logger-jsonl`.

### Out-of-tree upstream packages

`OUT_OF_TREE` in the script names upstream workspace members that do not live
under `packages/`. There is one: `native/landlock-run/packages/entry`, the JS
seam over the Landlock launcher, which `sandbox-local` imports statically even
on hosts that will never run Landlock (it probes, and falls back to Seatbelt on
macOS). It is **BSD-3-Clause**, not MIT, and carries its own `LICENSE`.

Its `optionalDependencies` — per-architecture Linux prebuilds — are dropped
along with every other `optionalDependencies` block: they are `workspace:*`
ranges into a native build tree we do not vendor, and pnpm rejects an
unresolvable workspace range even when it is optional. The consequence is
honest and narrow: on Linux, `sandbox-local`'s Landlock backend will fail its
probe and the sandbox falls through to its next backend.

---

## 4. Ported packages

Studied upstream, then written smaller. Neither file is a copy; the contract is
what carries over.

| Ours | Upstream studied | Status |
|---|---|---|
| ~~`packages/core/invariants`~~ | `runtime-diagnostics/invariants` | **retired 2026-08-27, phase 2.** Replaced by the vendored original |

**The table is empty, and that is the finding.** The one port we wrote came back
out at the first opportunity. It was faithful — its eight specs pass unchanged
against upstream's registry, which is how we know — but it had dropped
`PendingInvariantRegistration`, the thenable that makes a package's `apply`
await its own invariant child before the fiber reports ready. Thirty packages
now register through it. A reimplementation that is *almost* the contract is
worse than no reimplementation, because the divergence is invisible until
mount ordering matters.

The specs moved to `vendor/dsh/runtime-diagnostics/invariants/tests/`, renamed
to upstream's `package_allowlist` / `package_blocklist` config keys. They stay
because they are what catches a bad rescope.

---

## 5. Ours

Everything under `apps/`, `examples/`, `docs/`, `scripts/`, the workspace and
tsconfig layer, our own bundles, and every `packages/*` not listed in §4.

### `apps/web` — an upstream member we implement rather than vendor

`@se373/web-frontend` stands in for upstream's `apps/web`
(`@deepseek-ai/dsh-web-frontend`), and is listed in the script's `OURS` table so
`bundle/web-app` depends on *our* frontend by name and nothing needs patching
after a sync.

It is not vendored for two reasons. It is a Vite **application**, not a plugin
package: its whole public surface is a built `dist/`, so the script's manifest
rewrite — source `main`, source `exports`, a declarations-only tsconfig — would
describe a plugin and mis-describe an app. And it is the one place our board
joins dsh's shell, which makes it a file we edit rather than a file we sync.

What it contains is deliberately thin, and mostly upstream's shape: an
`index.html`, a `main.ts` that mounts `AppWebEntry` from the vendored
`@se373/client-web` and does nothing else, a `node:module` stub for the vendored
loader's one Node import, and the Vite config — chunking rules, the React dedupe,
and the loader defines. The branding is **not** upstream's: the DeepSeek favicon
and manifest are replaced rather than copied, because shipping another
organisation's mark on our page would misrepresent whose work it is.

`scripts/client-build-environment.ts` is ours for a narrower reason: only
`clientBuildEnvironmentDefines` is on our path, and the rest of upstream's file
is machinery for proving what DeepSeek published — a build profile, a required
commit hash, and a SHA-256 record binding an environment to a set of artifacts.
We publish nothing, so it is omitted rather than vendored.

---

## Known Limitations and Deferred Work

- **142 of the 187 in-scope packages are vendored** (phases 2, 3, 3.5 and 4:
  the chat closure, the tool and sandbox closure, the mock LLM server, the
  Landlock seam, `mcp-client`, and the whole `bundle/web-app` closure plus the
  four shell-side seeds `apps/web` links statically).
  `scripts/vendor-dsh.mjs` is the mechanism, so widening is a seed-list edit
  rather than new work.
- **`mcp-client` cost one package, not the two that were budgeted.**
  `typert/protocol` was already in the phase-3 closure, so the measured cost was
  `mcp/mcp-client` alone plus the `@modelcontextprotocol/sdk` dependency. The
  re-vendor of the other fourteen packages in its closure produced a byte-identical
  tree, which is the first independent evidence that the script is idempotent.
- ~~**Phase 4 takes `bundle/web-app` whole: 78 more packages, 60 → 138.**~~
  **Measured 2026-08-28: 142, not 138.** The prediction was four short because
  `apps/web` links four packages statically that no runtime closure reaches —
  `client-ui-primitives`, `client-ui-slots`, `client-web` and `pwsh-local` are
  devDependencies of the Vite app, so a dependency walk from `web-app` alone
  misses them. Original note, 2026-08-27: Two smaller tiers were considered and rejected — a page with no
  host RPC (3 new packages) and the `/api` transport without dsh's UI (27) — on
  the grounds that dsh's chat view is 14,904 lines we would otherwise
  reimplement, and that typert arrives with the transport whether we use it or
  not. `docs/design/builder-plane.md` and §13 of the architecture doc carry the
  reasoning.
- **The browser cannot run from source.** `client-modules` resolves
  `exports["./client"]` and `readFileSync`s the result to hash it; a missing
  `lib/client.js` is a fatal activation error, not a degradation. The host spine
  keeps running under `tsx`; the browser half cannot.
- **The client program does not compile yet, and the blocker is now a
  TypeScript version skew.** `tsc -b tsconfig.host.json` is clean.
  `scripts/typert-generate.mts` — the codegen step that writes each package's
  `lib/typert.host.*` and `lib/typert.remote-client.*`, which `tsc -b
  tsconfig.client.json` needs — gets as far as building real programs and then
  **crashes inside the TypeScript checker**
  (`getSymbolLinks: Cannot read properties of undefined`).

  The cause is visible: our root pins `typescript@^5.9.0`, while
  `typert/generator` declares `^6.0.3` and resolves its own copy. So a checker
  from TS 6 is analysing declarations emitted by TS 5.9. Upstream is on 6.0.3
  throughout. Moving our root to 6.0.3 is the obvious next step and is a change
  worth making deliberately rather than in passing — it is the compiler for
  every package we have.

  Everything downstream sits behind this: the client program, `tsdown` per
  client package, and the Vite build.
- **The Landlock backend is inert.** See "Out-of-tree upstream packages" above.
  On macOS this costs nothing; on Linux it silently narrows which sandbox
  backends can be selected, and nothing in the tree says so at runtime.
- There is no automated check that this file matches the tree. dsh gates
  provenance in CI; we do not yet. The script's own failure modes are checked
  (a stale `LOCAL_MODS` entry throws, a dropped devDependency is reported), but
  nothing verifies that §3's table still describes what the script does.
- **Upstream `tests/` are not copied**, so a vendored package is exercised only
  by whatever we write against it. Today that is the invariants registry and
  the phase-2 spine spec.
- ~~The vendored set is pinned to a dsh working tree at `47f94385`~~ —
  **corrected 2026-08-27.** It is `b150a551`, the same rev the architecture doc
  was written against, so there is no doc-vs-code drift. See §1.
- The §2 closure numbers are computed from declared manifest dependencies. A
  package may import less than it declares (dsh's own `hmr` declared less than
  it imports, which is how we caught that), so 187 is an upper bound on what
  must actually come along — phase 2 wanted 28 of the 126 in `base + headless`
  to answer one task, which suggests the bound is loose.
