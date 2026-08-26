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

## 3. Ported packages

Studied upstream, then written smaller. Neither file is a copy; the contract is
what carries over.

| Ours | Upstream studied | What we kept | What we dropped |
|---|---|---|---|
| `packages/core/invariants` | `packages/runtime-diagnostics/invariants` | `register(packageName, installer)` returning a disposer; `InvariantError` with `code: 'INVARIANT'` + `packageName`; regex allow/deny selection; child-fiber execution with reservation released on failure | i18n README pipeline; the `PendingInvariantRegistration` thenable shape; `package_allowlist` / `package_blocklist` naming (ours is `allow` / `deny`) |

This table should stay short. Under the vendoring rule it grows only by
exception.

---

## 4. Ours

Everything under `apps/`, `examples/`, `docs/`, the workspace and tsconfig
layer, our own bundles, and every `packages/*` not listed in §3.

---

## Known Limitations and Deferred Work

- §2 will grow substantially at phases 2–5, which is where the agent spine is
  ported. Each row must be filled in **as the port happens**, not afterwards.
- There is no automated check that this file matches the tree. dsh gates
  provenance in CI; we do not yet.
- The vendored set is pinned to a dsh working tree at `47f94385`, which is
  *older* than the `b150a55` the architecture doc was written against. Expect
  small drift between doc and code.
- The §2 closure numbers are computed from declared manifest dependencies. A
  package may import less than it declares (dsh's own `hmr` declared less than
  it imports, which is how we caught that), so 89 is an upper bound on what
  must actually come along.
