# Porting & Provenance

Every file in this repository is one of three things. This document says which,
and for anything copied, where it came from and what we changed.

| Origin | Where | Notice |
|---|---|---|
| **Vendored framework** — copied, rescoped, otherwise upstream | `vendor/*` | upstream MIT `LICENSE` preserved in each directory |
| **Ported** — studied upstream, rewritten smaller by us | `packages/*` (marked below) | credited per row |
| **Ours** — written for this project | everything else | — |

> **Open question D2 is still unanswered.** MIT permits everything recorded
> here. A course plagiarism policy is a separate rule that MIT does not answer,
> and it has not been ruled on in writing. Until it is, this file is the record
> that makes the split auditable either way.

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

## 2. Planned vendoring scope

Settled 2026-08-26: on-path upstream packages are **vendored and documented**,
not rewritten. What that actually costs, measured against the dsh tree at
`47f94385`:

| Seed set | Hard-dependency closure | Notes |
|---|---|---|
| 77 on-path packages | **173** (73% of upstream) | pulls in `typert`, `compaction`, `goal`, `workflow`, `spill`, `code-runtime`, `skill`, `session-query` — all on the skip list |
| 77 minus `bundle/*` | **89** | +15 beyond the seeds, all small seams |

The three `bundle/*` packages are the entire difference. They are profile
manifests whose job is to declare every row in a profile as a dependency, so
vendoring one drags its whole profile in. **We write our own bundles** — a
bundle is a row list, and ours names only our rows.

Third-party npm dependencies across the on-path set: 48, including `react`,
`react-dom`, `zod`, `chokidar`, `shiki`, `ws`, `@modelcontextprotocol/sdk`,
`@vscode/ripgrep`, and `node-pty`. Each needs an `allowBuilds` review in
`pnpm-workspace.yaml` before install.

### What this does to D2

Vendoring roughly 89 packages is substantially more copied MIT code than the
~12 the original plan implied. MIT still permits all of it and this file still
records it, but the *volume* is now the thing a plagiarism policy would react
to, not the principle. **Get the ruling before phase 2**, and lead with the
numbers in this table rather than with "we ported some helpers".

The mitigation the plan already names still applies, and gets stronger here: a
clean split table makes the work look bigger, not smaller. L3 and L4 — the
knowledge and builder planes, which are the actual project — have **no upstream
analogue at all**. Nothing in dsh corresponds to `ctx.embedder`, `ctx.chunker`,
`ctx.vectorStore`, `ctx.blocks`, or `ctx.promotion`.

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
