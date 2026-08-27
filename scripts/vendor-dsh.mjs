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
]

/** Files copied verbatim beside `src/`, when upstream has them. */
const SIDECARS = ['README.md', 'cordis.patch.yml']

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
    /** @type {any} */
    const entry = { ...value }
    if (typeof entry.default === 'string' && entry.default.startsWith('./lib/')) {
      entry.default = './src/' + entry.default.slice('./lib/'.length).replace(/\.js$/, '.ts')
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

const all = scanUpstream()

/**
 * Longest-first so `@deepseek-ai/dsh-llm-retry` is rewritten before
 * `@deepseek-ai/dsh-llm`. Framework names are included explicitly: they live in
 * dsh's own `vendor/`, outside `packages/`, so the scan never sees them.
 */
const renames = new Map(
  [...new Set([...all.keys(), ...FRAMEWORK.keys()])]
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
      if (!all.has(dep) && !FRAMEWORK.has(dep)) thirdParty.add(dep)
    }
  }
}

console.log(`closure: ${closure.size} packages (${toVendor.length} to vendor, ${closure.size - toVendor.length} already framework)`)
console.log(`third-party: ${[...thirdParty].sort().join(', ') || 'none'}`)
if (listOnly) {
  for (const name of toVendor) console.log(`  ${all.get(name).dir.padEnd(40)} ${name} -> ${rescope(name)}`)
  process.exit(0)
}

/** Directory of every vendored package, for tsconfig `references`. */
const dirOf = new Map(FRAMEWORK_DIR)
for (const name of toVendor) dirOf.set(rescope(name), `vendor/dsh/${all.get(name).dir}`)

/** Workspace dependencies dropped because they are test-only. */
const dropped = new Set()

let written = 0
let modded = 0
for (const name of toVendor) {
  const { dir, manifest } = all.get(name)
  const from = join(UP_PKGS, dir)
  const to = join(DEST_ROOT, dir)
  mkdirSync(to, { recursive: true })

  copySources(join(from, 'src'), join(to, 'src'), renames)
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
  writeFileSync(join(to, 'package.json'), JSON.stringify(out, null, 2) + '\n')

  for (const mod of LOCAL_MODS.filter(m => m.package === name)) {
    const target = join(to, mod.file)
    const before = readFileSync(target, 'utf8')
    const after = before.replace(applyRenames(mod.from, renames), applyRenames(mod.to, renames))
    if (after === before) throw new Error(`local modification no longer applies: ${name} ${mod.file} — ${mod.why}`)
    writeFileSync(target, after)
    modded += 1
  }

  const depth = dir.split('/').length + 2
  const up = '../'.repeat(depth)
  const references = workspaceDeps(manifest, all)
    .map(d => dirOf.get(rescope(d)))
    .filter(Boolean)
    .sort()
    .map(target => ({ path: up + target }))
  writeFileSync(join(to, 'tsconfig.json'), JSON.stringify({
    extends: `${up}tsconfig.vendor.base.json`,
    compilerOptions: { rootDir: 'src', outDir: 'lib/types' },
    include: ['src'],
    references,
  }, null, 2) + '\n')
  written += 1
}

// One LICENSE for the whole vendored harness tree; upstream keeps it at the repo root.
mkdirSync(DEST_ROOT, { recursive: true })
const upstreamLicense = join(UPSTREAM, 'LICENSE')
if (existsSync(upstreamLicense)) cpSync(upstreamLicense, join(DEST_ROOT, 'LICENSE'))

// Regenerate the vendor solution file so `tsc -b tsconfig.vendor.json` sees the new members.
const solution = join(REPO, 'tsconfig.vendor.json')
const existing = new Set(
  JSON.parse(readFileSync(solution, 'utf8').replace(/^\s*\/\/.*$/gm, ''))
    .references.map(r => r.path),
)
for (const name of toVendor) existing.add('./' + dirOf.get(rescope(name)))
writeFileSync(solution, [
  '{',
  '  // Solution file for the vendored layer. Emits declarations only, into each',
  '  // package\'s lib/types, which its package.json `types` field names.',
  '  //',
  '  // Regenerated by scripts/vendor-dsh.mjs. Run after `pnpm install` and after',
  '  // any vendor sync.',
  '  "files": [],',
  '  "references": [',
  [...existing].sort().map(p => `    { "path": ${JSON.stringify(p)} }`).join(',\n'),
  '  ]',
  '}',
  '',
].join('\n'))

console.log(`vendored ${written} packages into vendor/dsh/ (${modded} local modifications re-applied)`)
if (dropped.size > 0) console.log(`dropped ${dropped.size} test-only workspace deps: ${[...dropped].sort().join(', ')}`)
console.log('next: pnpm install && npx tsc -b tsconfig.vendor.json')
