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

Copied from the **DeepSeek Harness** working tree at `47f94385`, which had in
turn vendored them from Cordis upstream. So there are **two** layers of prior
work here, and both are MIT:

- **Cordis and its plugins** — © Shigma and contributors, `cordiverse/cordis`
- **DeepSeek Harness's modifications to them** — © DeepSeek, `deepseek-ai/deepseek-harness`

| Directory | Our name | Upstream name | Version | Upstream source |
|---|---|---|---|---|
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
5. `pnpm install && npx tsc -b tsconfig.vendor.json && npx vitest run`.

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
| `tsconfig.json` regenerated from the manifest's workspace dependencies | upstream's references are relative to *their* depth, and a hand-edited path is a silent build break |
| workspace `devDependencies` outside the closure are dropped | upstream devDeps carry test-only packages; we do not copy `tests/`, so pnpm would fail to link them. Each drop is reported |
| `README.md` and `cordis.patch.yml` copied beside `src/` | this is the per-package documentation the working rules require — upstream already wrote it |

`README.i18n.yaml`, `README.zh.md`, `lib/`, and `tests/` are not copied.

### Local modifications

Declared in the script's `LOCAL_MODS` table and re-applied on every sync. A
`from` that stops matching is a hard failure, not a silent skip: upstream moved
and the divergence needs re-deciding.

| # | Package | Change | Why |
|---|---|---|---|
| 6 | `util/home-paths` | `DSH_HOME_DIR_NAME`: `.dsh` → `.se373` | without it our tree reads and writes a co-installed dsh's sessions, settings, and credential store |
| 7 | `util/home-paths` | `DSH_HOME_ENV`: `DSH_HOME` → `SE373_HOME` | a dsh user pointing `$DSH_HOME` elsewhere must not drag our tree with it |

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

---

## Known Limitations and Deferred Work

- **31 of the 187 in-scope packages are vendored** (phase 2's chat closure plus
  the mock LLM server). Phases 3–5 pull the rest; `scripts/vendor-dsh.mjs` is
  the mechanism, so widening is a seed-list edit rather than new work.
- There is no automated check that this file matches the tree. dsh gates
  provenance in CI; we do not yet. The script's own failure modes are checked
  (a stale `LOCAL_MODS` entry throws, a dropped devDependency is reported), but
  nothing verifies that §3's table still describes what the script does.
- **Upstream `tests/` are not copied**, so a vendored package is exercised only
  by whatever we write against it. Today that is the invariants registry and
  the phase-2 spine spec.
- The vendored set is pinned to a dsh working tree at `47f94385`, which is
  *older* than the `b150a55` the architecture doc was written against. Expect
  small drift between doc and code.
- The §2 closure numbers are computed from declared manifest dependencies. A
  package may import less than it declares (dsh's own `hmr` declared less than
  it imports, which is how we caught that), so 187 is an upper bound on what
  must actually come along — phase 2 wanted 28 of the 126 in `base + headless`
  to answer one task, which suggests the bound is loose.
