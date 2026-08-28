#!/usr/bin/env node
/**
 * Vendor packages from the DeepSeek Harness working tree into `vendor/dsh/`,
 * rescoped to `@se373/*`.
 *
 * This is the repeatable half of `docs/PORTING.md` §1's sync procedure. Every
 * transformation it performs is logged there; if you change one, change that
 * document in the same commit.
 *
 * Usage:
 *   node scripts/vendor-dsh.mjs <seed>...     # vendor the dependency closure
 *   node scripts/vendor-dsh.mjs --list <seed>...   # report, write nothing
 *
 * Seeds name upstream packages without their scope or `dsh-` prefix, e.g.
 * `agent-loop`, `llm-deepseek`, `headless`.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM = resolve(process.env.DSH_ROOT ?? join(REPO, '..', 'deepseek-harness'))
const UP_PKGS = join(UPSTREAM, 'packages')
const DEST_ROOT = join(REPO, 'vendor', 'dsh')

/**
 * Framework packages already vendored flat under `vendor/`. They are in the
 * closure of nearly everything and must never be copied a second time.
 * @type {Map<string, string>} upstream name -> our name
 */
const FRAMEWORK = new Map([
  ['@deepseek-ai/cordis', '@se373/cordis'],
  ['@deepseek-ai/cosmokit', '@se373/cosmokit'],
  ['@deepseek-ai/schemastery', '@se373/schemastery'],
  ['@deepseek-ai/cordis-plugin-loader', '@se373/cordis-plugin-loader'],
  ['@deepseek-ai/cordis-plugin-include', '@se373/cordis-plugin-include'],
  ['@deepseek-ai/cordis-plugin-group', '@se373/cordis-plugin-group'],
  ['@deepseek-ai/cordis-plugin-timer', '@se373/cordis-plugin-timer'],
  ['@deepseek-ai/cordis-plugin-hmr', '@se373/cordis-plugin-hmr'],
  ['@deepseek-ai/cordis-plugin-logger-console', '@se373/cordis-plugin-logger-console'],
])

/** Where each framework package sits, for tsconfig `references`. */
const FRAMEWORK_DIR = new Map([
  ['@se373/cordis', 'vendor/cordis'],
  ['@se373/cosmokit', 'vendor/cosmokit'],
  ['@se373/schemastery', 'vendor/schemastery'],
  ['@se373/cordis-plugin-loader', 'vendor/loader'],
  ['@se373/cordis-plugin-include', 'vendor/include'],
  ['@se373/cordis-plugin-group', 'vendor/group'],
  ['@se373/cordis-plugin-timer', 'vendor/timer'],
  ['@se373/cordis-plugin-hmr', 'vendor/hmr'],
  ['@se373/cordis-plugin-logger-console', 'vendor/logger-console'],
])

/**
 * Upstream workspace members that live outside `packages/`.
 *
 * `sandbox-local` statically imports the Landlock launcher's JS seam, so the
 * name has to resolve even on a host that will never run Landlock (it probes
 * and falls back to Seatbelt on macOS). Note the licence: this one is
 * BSD-3-Clause, not MIT, and carries its own LICENSE file.
 * @type {Map<string, string>} upstream path under the repo root -> our path under vendor/dsh
 */
const OUT_OF_TREE = new Map([
  ['native/landlock-run/packages/entry', 'native/landlock-run'],
])

/**
 * Upstream workspace members we implement ourselves rather than vendor.
 *
 * `apps/web` is a Vite *application*, not a plugin package: its whole public
 * surface is a built `dist/`, so this script's manifest rewrite — source
 * `main`, source `exports`, a declarations-only tsconfig — would describe a
 * plugin and mis-describe an app. It is also where our board joins dsh's
 * shell, which makes it a file we edit rather than a file we sync.
 *
 * Names here are rescoped like any vendored package, so `bundle/web-app`
 * depends on OUR frontend by name and nothing has to be patched after a sync.
 * @type {Map<string, string>} upstream name -> our name, provided under `apps/`
 */
const OURS = new Map([
  ['@deepseek-ai/dsh-web-frontend', '@se373/web-frontend'],
])

/**
 * Upstream files that are shared by a whole package group rather than owned by
 * one package, copied with the scope rename and the layout rewrites below.
 *
 * `packages/client/tsdown.client.ts` is the browser build preset every UI
 * plugin's three-line `tsdown.config.ts` calls into. It is not a package, so
 * the closure never reaches it, and it is far too load-bearing to reimplement:
 * the module-table externals, the purity gate, the CSS pipeline and the
 * `__ModuleLoader__` handoff are all decided here.
 *
 * `rewrites` are layout-only. Upstream's presets read the repository through
 * `packages/*` paths; ours live one level deeper under `vendor/dsh/`. Each is a
 * hard failure when it stops matching, for the same reason `LOCAL_MODS` are.
 * @type {{from: string, to: string, rewrites: {from: string, to: string, why: string}[]}[]}
 */
const SHARED_FILES = [
  {
    from: 'packages/client/tsdown.client.ts',
    to: 'client/tsdown.client.ts',
    rewrites: [
      {
        from: "const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))",
        to: "const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url))",
        why: 'the preset sits at vendor/dsh/client/, one level deeper than upstream packages/client/',
      },
      {
        from: "globSync('packages/*/*/package.json', { cwd: REPOSITORY_ROOT })",
        to: "globSync('vendor/dsh/*/*/package.json', { cwd: REPOSITORY_ROOT })",
        why: 'our harness packages live under vendor/dsh, not packages',
      },
      {
        from: "return repositoryPath.startsWith('packages/') ? `../../../${repositoryPath}` : source",
        to: "return repositoryPath.startsWith('vendor/dsh/') ? `../../../${repositoryPath}` : source",
        why: 'browser sourcemap paths mirror our directories, not upstream\'s',
      },
      {
        from: "throw new Error(`tsdown: no packages/*/*/package.json declares the name ${id}`)",
        to: "throw new Error(`tsdown: no vendor/dsh/*/*/package.json declares the name ${id}`)",
        why: 'the diagnostic must name the path a reader would actually look in',
      },
      {
        from: "from '../../scripts/client-build-environment.ts'",
        to: "from '../../../scripts/client-build-environment.ts'",
        why: 'same one-level-deeper layout as REPOSITORY_ROOT above',
      },
    ],
  },
]

/**
 * Divergences applied on top of the copy, re-applied on every sync so a
 * re-vendor is idempotent. Every entry here must also appear in
 * `docs/PORTING.md` §1 "Our modifications on top". A `from` that no longer
 * matches is a hard failure, not a silent skip: upstream moved, and the
 * divergence needs re-deciding.
 * @type {{package: string, file: string, from: string, to: string, why: string}[]}
 */
const LOCAL_MODS = [
  {
    // Without this our tree reads and writes the user's real dsh installation:
    // its sessions, its settings document, its credential store.
    package: '@deepseek-ai/dsh-home-paths',
    file: 'src/index.ts',
    from: "export const DSH_HOME_DIR_NAME = '.dsh'",
    to: "export const DSH_HOME_DIR_NAME = '.se373'",
    why: 'keep our user-data root out of a co-installed dsh',
  },
  {
    package: '@deepseek-ai/dsh-home-paths',
    file: 'src/index.ts',
    from: "export const DSH_HOME_ENV = 'DSH_HOME'",
    to: "export const DSH_HOME_ENV = 'SE373_HOME'",
    why: 'a dsh user pointing $DSH_HOME somewhere must not move our tree with it',
  },
  {
    // The namespace the harness announces itself under inside child processes:
    // SE373_SHELL, SE373_SESSION_ID, SE373_SESSION_JSONL. A tool running under
    // us should not report that it is inside dsh. This is also what keeps the
    // rename above type-checkable: shell-env types its exported keys as
    // `${DSH_ENV_PREFIX}${string}`, so SE373_HOME only fits once the prefix moves.
    package: '@deepseek-ai/dsh-subprocess',
    file: 'src/types.ts',
    from: "export const DSH_ENV_PREFIX = 'DSH_' as const",
    to: "export const DSH_ENV_PREFIX = 'SE373_' as const",
    why: 'one prefix for every harness variable a child process sees',
  },
  {
    // Fallout from the prefix rename above, and the reason that rename is
    // type-checkable rather than cosmetic: `shell-env` types its keys as
    // `${DSH_ENV_PREFIX}${string}`, so a literal DSH_ name no longer fits.
    package: '@deepseek-ai/dsh-web-app',
    file: 'src/index.ts',
    from: "const DSH_WEB_URL = 'DSH_WEB_URL' as const",
    to: "const DSH_WEB_URL = 'SE373_WEB_URL' as const",
    why: 'the agent must see one harness variable namespace, not two',
  },
]

/**
 * Workspace dependencies added to a vendored manifest.
 *
 * Upstream can leave a type-only import undeclared because its root
 * `tsconfig.base.json` carries a `paths` facade mapping every `@deepseek-ai/*`
 * name straight to source. We deliberately have no such facade — pnpm's
 * workspace links are the only resolution, so a package that forgets to declare
 * a dependency fails to resolve instead of silently working, which is the same
 * discipline Cordis wants from `inject`. The cost is that upstream's undeclared
 * edges have to be written down here.
 * @type {Map<string, Record<string, string>>} upstream package -> deps to add
 */
const EXTRA_DEPS = new Map([
  // `import type { ScopeKey } from '.../scope'` in src/api-proxy.ts.
  ['@deepseek-ai/dsh-host-apiproxy', { '@deepseek-ai/dsh-scope': 'workspace:^' }],
])

/**
 * Files copied verbatim beside `src/`, when upstream has them.
 *
 * `tsdown.config.ts` comes along because a UI plugin's browser artifact is
 * built, not run from source, and the config is where that package states its
 * entries. It is three lines of call site over a shared preset; leaving it
 * behind would mean re-deriving 40-odd of them by hand.
 */
const SIDECARS = ['README.md', 'cordis.patch.yml', 'tsdown.config.ts']

/**
 * Read every upstream workspace manifest.
 * @returns {Map<string, {dir: string, manifest: any}>} keyed by upstream package name.
 */
function scanUpstream() {
  /** @type {Map<string, {dir: string, manifest: any}>} */
  const found = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      const manifestPath = join(full, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (manifest.name) found.set(manifest.name, { dir: relative(UP_PKGS, full), manifest })
      }
      walk(full)
    }
  }
  walk(UP_PKGS)
  for (const [from, to] of OUT_OF_TREE) {
    const manifest = JSON.parse(readFileSync(join(UPSTREAM, from, 'package.json'), 'utf8'))
    found.set(manifest.name, { dir: to, manifest, from })
  }
  return found
}

/**
 * Our name for an upstream workspace package.
 * @param {string} name - upstream package name.
 * @returns {string} the `@se373/*` name.
 */
function rescope(name) {
  const framework = FRAMEWORK.get(name)
  if (framework) return framework
  const ours = OURS.get(name)
  if (ours) return ours
  // Not every `@deepseek-ai/*` name is upstream's own workspace: some are
  // ordinary npm packages they publish and depend on, like
  // `@deepseek-ai/node-addon-landlock-run`. Renaming one of those would point
  // the manifest at a workspace member that does not exist.
  if (!all.has(name)) return name
  if (name.startsWith('@deepseek-ai/dsh-')) return '@se373/' + name.slice('@deepseek-ai/dsh-'.length)
  if (name.startsWith('@deepseek-ai/')) return '@se373/' + name.slice('@deepseek-ai/'.length)
  return name
}

/**
 * Workspace-internal dependencies declared by a manifest.
 * @param {any} manifest - upstream package.json.
 * @param {Map<string, any>} all - every upstream workspace package.
 * @returns {string[]} upstream names.
 */
function workspaceDeps(manifest, all) {
  const names = new Set()
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const dep of Object.keys(manifest[field] ?? {})) if (all.has(dep)) names.add(dep)
  }
  return [...names]
}

/**
 * Export keys that must keep naming built output.
 *
 * The host half runs from source under `tsx`; the browser half cannot. A UI
 * plugin's `./client` condition is resolved by `client-modules`, which
 * `readFileSync`s the result to hash it and then serves those bytes to a
 * browser — so pointing it at `src/client/index.tsx` would ship TSX to a
 * runtime that cannot parse it, and a missing artifact is a fatal activation
 * error rather than a degradation. These stay on `lib/`, and the client build
 * is what puts a file there.
 */
const BUILT_EXPORT_KEYS = /^\.\/client(\/|$)/

/**
 * Rewrite an `exports` map from built output to source.
 * @param {any} exports - upstream exports field.
 * @returns {any} exports naming `src/*.ts` at runtime and `lib/types/*.d.ts` for tsc.
 */
function sourceExports(exports) {
  if (!exports) return { '.': { types: './lib/types/index.d.ts', default: './src/index.ts' }, './package.json': './package.json' }
  /** @type {any} */
  const out = {}
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === 'string') { out[key] = value; continue }
    if (BUILT_EXPORT_KEYS.test(key)) { out[key] = { ...value }; continue }
    /** @type {any} */
    const entry = { ...value }
    // `lib/types` is the declaration output dir, so `./lib/types/types.js` is
    // the emit of `src/types.ts` — NOT of `src/types/types.ts`. Stripping only
    // `./lib/` would point the export one directory too deep.
    if (typeof entry.default === 'string' && entry.default.startsWith('./lib/types/')) {
      entry.default = './src/' + entry.default.slice('./lib/types/'.length).replace(/\.js$/, '.ts')
    } else if (typeof entry.default === 'string' && entry.default.startsWith('./lib/')) {
      entry.default = './src/' + entry.default.slice('./lib/'.length).replace(/\.js$/, '.ts')
    }
    // Our tsconfigs emit declarations to lib/types. Most upstream packages
    // already say that; one out-of-tree package emits beside its JS.
    if (typeof entry.types === 'string' && entry.types.startsWith('./lib/') && !entry.types.startsWith('./lib/types/')) {
      entry.types = './lib/types/' + entry.types.slice('./lib/'.length)
    }
    out[key] = entry
  }
  return out
}

/**
 * Apply the scope rename to a source or manifest text.
 * @param {string} text - file contents.
 * @param {Map<string, string>} renames - upstream name -> our name, longest key first.
 * @returns {string} rewritten contents.
 */
function applyRenames(text, renames) {
  let out = text
  for (const [from, to] of renames) out = out.replaceAll(from, to)
  return out
}

/**
 * Copy `src/` with every module specifier rescoped.
 * @param {string} from - upstream directory.
 * @param {string} to - destination directory.
 * @param {Map<string, string>} renames - rename table.
 */
function copySources(from, to, renames) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (entry.isDirectory()) { copySources(src, dst, renames); continue }
    if (/\.(ts|tsx|js|mjs|json|yml|yaml)$/.test(entry.name)) {
      writeFileSync(dst, applyRenames(readFileSync(src, 'utf8'), renames))
    } else {
      cpSync(src, dst)
    }
  }
}

/**
 * The upstream commit this run copies from, recorded into every package it
 * writes.
 *
 * A single pin in prose does not survive selective migration, and it did not
 * survive being written down: `docs/PORTING.md` claimed `47f94385` for a tree
 * that was byte-identical to `b150a551`. Per-package provenance makes the
 * question answerable from the tree instead of from a document.
 * @returns the upstream HEAD, marked dirty when its working tree is not clean.
 */
function upstreamRev() {
  const git = (...args) => execFileSync('git', ['-C', UPSTREAM, ...args], { encoding: 'utf8' }).trim()
  const rev = git('rev-parse', 'HEAD')
  return git('status', '--porcelain') === '' ? rev : `${rev}-dirty`
}

const REV = upstreamRev()

const all = scanUpstream()

/**
 * Longest-first so `@deepseek-ai/dsh-llm-retry` is rewritten before
 * `@deepseek-ai/dsh-llm`. Framework names are included explicitly: they live in
 * dsh's own `vendor/`, outside `packages/`, so the scan never sees them.
 */
const renames = new Map(
  [...new Set([...all.keys(), ...FRAMEWORK.keys(), ...OURS.keys()])]
    .sort((a, b) => b.length - a.length)
    .map(n => [n, rescope(n)]),
)

const listOnly = process.argv.includes('--list')
const seeds = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (seeds.length === 0) {
  console.error('usage: node scripts/vendor-dsh.mjs [--list] <seed>...')
  process.exit(2)
}

/** Resolve a bare seed to its upstream name. */
const resolveSeed = (seed) => {
  for (const candidate of [seed, `@deepseek-ai/dsh-${seed}`, `@deepseek-ai/${seed}`]) {
    if (all.has(candidate)) return candidate
  }
  throw new Error(`no upstream package matches seed "${seed}"`)
}

/** Transitive closure over declared workspace dependencies. */
const closure = new Set()
const queue = seeds.map(resolveSeed)
while (queue.length > 0) {
  const name = queue.pop()
  if (closure.has(name)) continue
  closure.add(name)
  queue.push(...workspaceDeps(all.get(name).manifest, all))
}

const toVendor = [...closure].filter(n => !FRAMEWORK.has(n)).sort()

/** Third-party npm dependencies the closure needs installed. */
const thirdParty = new Set()
for (const name of closure) {
  const { manifest } = all.get(name)
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      // The framework layer lives in `vendor/`, outside upstream's `packages/`,
      // so it is not in `all` — but it is not third-party either.
      if (!all.has(dep) && !FRAMEWORK.has(dep) && !OURS.has(dep)) thirdParty.add(dep)
    }
  }
}

console.log(`upstream: ${REV}`)
console.log(`closure: ${closure.size} packages (${toVendor.length} to vendor, ${closure.size - toVendor.length} already framework)`)
console.log(`third-party: ${[...thirdParty].sort().join(', ') || 'none'}`)
if (listOnly) {
  for (const name of toVendor) console.log(`  ${all.get(name).dir.padEnd(40)} ${name} -> ${rescope(name)}`)
  process.exit(0)
}

/** Directory of every vendored package, for tsconfig `references`. */
const dirOf = new Map(FRAMEWORK_DIR)
for (const name of toVendor) dirOf.set(rescope(name), `vendor/dsh/${all.get(name).dir}`)

/**
 * Every vendored package, keyed by upstream `<group>/<pkg>`.
 *
 * The union of what this run writes and what earlier runs left on disk: a
 * targeted re-vendor of one seed must not drop the rest of the tree out of the
 * solution files, which are regenerated whole every time.
 */
const vendoredDirs = new Set(toVendor.map(name => all.get(name).dir))
for (const group of existsSync(DEST_ROOT) ? readdirSync(DEST_ROOT, { withFileTypes: true }) : []) {
  if (!group.isDirectory()) continue
  for (const pkg of readdirSync(join(DEST_ROOT, group.name), { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    if (existsSync(join(DEST_ROOT, group.name, pkg.name, 'package.json'))) {
      vendoredDirs.add(`${group.name}/${pkg.name}`)
    }
  }
}

/**
 * Upstream root tsconfigs, and ours that stand in for them.
 *
 * The two bases are the host/client split: upstream's client base adds React
 * JSX and the DOM library, and the two planes cannot share one program because
 * both merge cordis `Context` under the same keys with different services.
 */
const BASE_TSCONFIG = new Map([
  ['tsconfig.base.json', 'tsconfig.vendor.base.json'],
  ['tsconfig.base.client.json', 'tsconfig.vendor.client.base.json'],
])

/**
 * Rewrite one `extends`/`references` path from upstream's layout onto ours.
 *
 * Group and package directories are mirrored exactly, so most paths are already
 * correct; what moves is everything *outside* `packages/` — the framework under
 * `vendor/`, the Landlock launcher, and the root bases — plus one extra level
 * of nesting, because our harness tree sits under `vendor/dsh`.
 * @param value - the path as upstream wrote it, relative to its package dir.
 * @param upstreamDir - the upstream package directory, `<group>/<pkg>`.
 * @param ourDir - the absolute directory the vendored package is written to.
 * @param vendored - every upstream `<group>/<pkg>` this run produced.
 * @returns the rewritten path, or `undefined` when the target is not vendored.
 */
function remapProjectPath(value, upstreamDir, ourDir, vendored) {
  // Intra-package halves (./tsconfig.host.json) need no rewriting at all.
  if (value.startsWith('./')) return value

  const absolute = resolve(join(UP_PKGS, upstreamDir), value)
  const suffixIndex = absolute.lastIndexOf('/tsconfig')
  const suffix = suffixIndex === -1 ? '' : absolute.slice(suffixIndex + 1)
  const target = suffixIndex === -1 ? absolute : absolute.slice(0, suffixIndex)

  const base = BASE_TSCONFIG.get(relative(UPSTREAM, absolute))
  if (base !== undefined) return relative(ourDir, join(REPO, base))

  const inPackages = relative(UP_PKGS, target)
  if (!inPackages.startsWith('..')) {
    if (!vendored.has(inPackages)) return undefined
    return relative(ourDir, join(DEST_ROOT, inPackages, suffix))
  }

  const outOfTree = OUT_OF_TREE.get(relative(UPSTREAM, target))
  if (outOfTree !== undefined) return relative(ourDir, join(DEST_ROOT, outOfTree, suffix))

  const inVendor = relative(join(UPSTREAM, 'vendor'), target)
  if (!inVendor.startsWith('..')) return relative(ourDir, join(REPO, 'vendor', inVendor, suffix))

  return undefined
}

/**
 * Copy every tsconfig a package owns, rather than generating one.
 *
 * Generating them from manifest dependencies is what the earlier phases did,
 * and it does not survive the browser half: upstream splits a package that has
 * both faces into `tsconfig.host.json` and `tsconfig.client.json` with a
 * solution file over them, and those reference lists are hand-curated to keep
 * the two programs acyclic. Deriving them instead produced a genuine cycle
 * (`api/gateway -> client/connection -> host/apiproxy -> api/remotes`) the
 * moment the client packages arrived — because a devDependency edge that is
 * fine for npm is a cycle for `tsc -b`.
 *
 * So the tsconfigs are vendored like the sources are, for the same reason: the
 * curation is the value, and we cannot re-derive it.
 * @param from - the upstream package directory.
 * @param to - the destination directory.
 * @param upstreamDir - the upstream package directory, `<group>/<pkg>`.
 * @param vendored - every upstream `<group>/<pkg>` this run produced.
 */
function vendorTsconfigs(from, to, upstreamDir, vendored) {
  const names = readdirSync(from).filter(name => /^tsconfig(\..+)?\.json$/.test(name))
  for (const name of names) {
    const config = JSON.parse(readFileSync(join(from, name), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    if (typeof config.extends === 'string') {
      const mapped = remapProjectPath(config.extends, upstreamDir, to, vendored)
      if (mapped === undefined) throw new Error(`${upstreamDir}/${name}: cannot map extends ${config.extends}`)
      config.extends = mapped
    }
    if (Array.isArray(config.references)) {
      config.references = config.references
        .map(reference => remapProjectPath(reference.path, upstreamDir, to, vendored))
        .filter(path => path !== undefined)
        .map(path => ({ path }))
    }
    // Upstream test globs point at a `tests/` we never copy, and an `include`
    // that matches nothing is a hard tsc error rather than an empty project.
    if (Array.isArray(config.include)) {
      config.include = config.include.filter(pattern => !pattern.startsWith('tests'))
    }
    if (Array.isArray(config.files)) {
      config.files = config.files.filter(file => file.startsWith('src/'))
    }
    writeFileSync(join(to, name), JSON.stringify(config, null, 2) + '\n')
  }
}

/** Workspace dependencies dropped because they are test-only. */
const dropped = new Set()

let written = 0
let modded = 0
for (const name of toVendor) {
  const entry = all.get(name)
  const { dir, manifest } = entry
  const from = entry.from === undefined ? join(UP_PKGS, dir) : join(UPSTREAM, entry.from)
  const to = join(DEST_ROOT, dir)
  mkdirSync(to, { recursive: true })

  copySources(join(from, 'src'), join(to, 'src'), renames)
  // A package with its own licence carries it; the rest are covered by the one
  // LICENSE at the root of vendor/dsh.
  const ownLicense = entry.from === undefined ? undefined : join(UPSTREAM, dirname(dirname(entry.from)), 'LICENSE')
  if (ownLicense !== undefined && existsSync(ownLicense)) cpSync(ownLicense, join(to, 'LICENSE'))

  for (const sidecar of SIDECARS) {
    const src = join(from, sidecar)
    if (!existsSync(src)) continue
    writeFileSync(join(to, sidecar), applyRenames(readFileSync(src, 'utf8'), renames))
  }

  /** @type {any} */
  const out = {
    name: rescope(name),
    description: manifest.description,
    version: manifest.version,
    private: true,
    type: 'module',
    main: 'src/index.ts',
    types: 'lib/types/index.d.ts',
    exports: sourceExports(manifest.exports),
    license: manifest.license ?? 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/zAcherttp/se373.git', directory: `vendor/dsh/${dir}` },
  }
  if (manifest.dsh) out.dsh = manifest.dsh
  out.se373 = {
    upstream: {
      repo: 'deepseek-ai/deepseek-harness',
      rev: REV,
      path: entry.from ?? `packages/${dir}`,
      name,
    },
  }
  // `optionalDependencies` are dropped wholesale. The only one in the taken set
  // is Landlock's per-architecture Linux prebuilds, which are `workspace:*`
  // members of a native build tree we do not vendor; pnpm rejects an
  // unresolvable workspace range even when it is optional.
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const source = manifest[field]
    if (!source) continue
    /** @type {any} */
    const rewritten = {}
    for (const [dep, range] of Object.entries(source)) {
      // Upstream devDependencies also carry test-only workspace packages. We do
      // not copy `tests/`, so those are not in the closure and pnpm would fail
      // to link them. Drop and report rather than dragging the closure wider.
      if (all.has(dep) && !closure.has(dep)) { dropped.add(`${rescope(name)} -> ${rescope(dep)}`); continue }
      rewritten[rescope(dep)] = range
    }
    out[field] = rewritten
  }
  for (const [dep, range] of Object.entries(EXTRA_DEPS.get(name) ?? {})) {
    if (!closure.has(dep)) throw new Error(`extra dependency ${dep} of ${name} is not in the vendored closure`)
    out.dependencies = { ...out.dependencies, [rescope(dep)]: range }
  }
  writeFileSync(join(to, 'package.json'), JSON.stringify(out, null, 2) + '\n')

  for (const mod of LOCAL_MODS.filter(m => m.package === name)) {
    const target = join(to, mod.file)
    const before = readFileSync(target, 'utf8')
    const after = before.replace(applyRenames(mod.from, renames), applyRenames(mod.to, renames))
    if (after === before) throw new Error(`local modification no longer applies: ${name} ${mod.file} — ${mod.why}`)
    writeFileSync(target, after)
    modded += 1
  }

  vendorTsconfigs(from, to, dir, vendoredDirs)
  written += 1
}

for (const shared of SHARED_FILES) {
  const target = join(DEST_ROOT, shared.to)
  mkdirSync(dirname(target), { recursive: true })
  let text = applyRenames(readFileSync(join(UPSTREAM, shared.from), 'utf8'), renames)
  for (const rewrite of shared.rewrites) {
    const from = applyRenames(rewrite.from, renames)
    const after = text.replace(from, applyRenames(rewrite.to, renames))
    if (after === text) throw new Error(`shared-file rewrite no longer applies: ${shared.from} — ${rewrite.why}`)
    text = after
  }
  writeFileSync(target, text)
}

// One LICENSE for the whole vendored harness tree; upstream keeps it at the repo root.
mkdirSync(DEST_ROOT, { recursive: true })
const upstreamLicense = join(UPSTREAM, 'LICENSE')
if (existsSync(upstreamLicense)) cpSync(upstreamLicense, join(DEST_ROOT, 'LICENSE'))

/**
 * Regenerate a vendor solution file from one of upstream's own aggregates.
 *
 * The membership is upstream's, filtered to what we vendored: the host and
 * client aggregates are where dsh decides which face of a split package belongs
 * to which program, and that decision is what keeps `tsc -b` acyclic. Inferring
 * it from our tree instead is what produced the
 * `api/gateway -> client/connection -> host/apiproxy -> api/remotes` cycle.
 * @param aggregate - upstream's aggregate filename.
 * @param target - our solution filename.
 * @param extra - project paths of ours to add, repo-relative.
 * @param note - the comment written at the top of the file.
 * @returns the upstream `<group>/<pkg>` directories this solution covers.
 */
function writeSolution(aggregate, target, extra, note) {
  const upstream = JSON.parse(
    readFileSync(join(UPSTREAM, aggregate), 'utf8').replace(/^\s*\/\/.*$/gm, ''),
  )
  const paths = new Set(extra)
  const covered = new Set()
  for (const reference of upstream.references ?? []) {
    // Aggregate paths are repo-relative (`./packages/...`), so they map the
    // same way a package's own references do — from a notional package at the
    // repository root.
    const absolute = resolve(UPSTREAM, reference.path)
    const suffixIndex = absolute.lastIndexOf('/tsconfig')
    const suffix = suffixIndex === -1 ? '' : absolute.slice(suffixIndex + 1)
    const dir = suffixIndex === -1 ? absolute : absolute.slice(0, suffixIndex)
    const inPackages = relative(UP_PKGS, dir)
    if (!inPackages.startsWith('..')) {
      if (!vendoredDirs.has(inPackages)) continue
      covered.add(inPackages)
      paths.add(`./vendor/dsh/${inPackages}${suffix === '' ? '' : `/${suffix}`}`)
      continue
    }
    const outOfTree = OUT_OF_TREE.get(relative(UPSTREAM, dir))
    if (outOfTree !== undefined) { paths.add(`./vendor/dsh/${outOfTree}`); continue }
    const inVendor = relative(join(UPSTREAM, 'vendor'), dir)
    if (!inVendor.startsWith('..')) paths.add(`./vendor/${inVendor}`)
  }
  writeFileSync(join(REPO, target), [
    '{',
    ...note.map(line => `  // ${line}`),
    '  "files": [],',
    '  "references": [',
    [...paths].sort().map(path => `    { "path": ${JSON.stringify(path)} }`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n'))
  for (const path of extra) {
    const inPackages = relative('vendor/dsh', path.slice('./'.length))
    if (!inPackages.startsWith('..')) covered.add(inPackages)
  }
  return covered
}

const clientCovered = writeSolution('tsconfig.client.json', 'tsconfig.vendor.client.json', [], [
  'Browser-plane solution for the vendored layer. A separate program because',
  'both planes merge cordis `Context` under the same keys with different',
  'services, and one program cannot hold both sides of that merge. It also',
  'EMITS JAVASCRIPT, not just declarations: each UI plugin\'s browser bundle is',
  'tsdown over the lib/types JS this program produces.',
  '',
  'Membership mirrors upstream tsconfig.client.json, filtered to what we',
  'vendored. Regenerated by scripts/vendor-dsh.mjs; do not hand-edit.',
])

// Upstream's host aggregate reaches many packages only through `apps/cli` and
// `bundle/base`, neither of which we vendor, so a straight filter would leave
// our phase-2 and phase-3 rows in no program at all and with no declarations
// for our own program to resolve. Everything vendored that the browser plane
// does not claim belongs to the host plane.
const hostExtra = [...vendoredDirs]
  .filter(dir => !clientCovered.has(dir))
  .map(dir => `./vendor/dsh/${dir}`)

writeSolution('tsconfig.host.json', 'tsconfig.vendor.json', hostExtra, [
  'Host-plane solution for the vendored layer. Emits declarations only, into',
  "each package's lib/types, which its package.json `types` field names.",
  '',
  'Membership mirrors upstream tsconfig.host.json, filtered to what we',
  'vendored. Regenerated by scripts/vendor-dsh.mjs; do not hand-edit.',
])
console.log(`vendored ${written} packages into vendor/dsh/ (${modded} local modifications re-applied)`)
if (dropped.size > 0) console.log(`dropped ${dropped.size} test-only workspace deps: ${[...dropped].sort().join(', ')}`)
console.log('next: pnpm install && npx tsc -b tsconfig.vendor.json && npx tsc -b tsconfig.vendor.client.json')
