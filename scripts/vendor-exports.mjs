/**
 * How a vendored package's `exports` map is rewritten, as pure functions.
 *
 * Extracted from `vendor-dsh.mjs` so it can be tested directly. Both bugs this
 * code has had were silent -- an export pointing one directory too deep, and a
 * browser artifact rewritten to TypeScript source -- and neither surfaced until
 * something unrelated tripped over it much later.
 *
 * @module scripts/vendor-exports
 */

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
 *
 * `./typert` and `./remote` are there for a different reason: they have no
 * source at all. They are generated per package by the typert generator, which
 * also *validates* that the manifest names exactly `./lib/typert.<face>.js` —
 * so rewriting them to source both points at a file that will never exist and
 * makes codegen refuse to run.
 */
export const BUILT_EXPORT_KEYS = /^\.\/(client|typert|remote)(\/|$)/

/** The generated-face export keys, which also gate whether `files` is kept. */
export const BUILT_FACE_KEYS = ['./typert', './client/typert', './remote']

/**
 * Rewrite an `exports` map from built output to source.
 * @param {any} exports - upstream exports field.
 * @returns {any} exports naming `src/*.ts` at runtime and `lib/types/*.d.ts` for tsc.
 */
export function sourceExports(exports) {
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
