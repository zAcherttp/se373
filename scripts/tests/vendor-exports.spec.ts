/**
 * The two rewrites that have been silently wrong, and the one that must not
 * happen at all.
 *
 * A vendored manifest's `exports` map decides what Node loads at runtime. Get
 * it wrong and nothing complains until something much later cannot resolve a
 * name — which is exactly how both of these bugs survived several phases.
 */

import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain .mjs module with no declarations; the shapes are
// asserted below rather than by the compiler.
import { sourceExports } from '../vendor-exports.mjs'

/** `sourceExports` returns a plain object; narrow it once for readability. */
function rewrite(exports: unknown): Record<string, { types?: string; default?: string } | string> {
  return sourceExports(exports) as Record<string, { types?: string; default?: string } | string>
}

describe('sourceExports', () => {
  it('maps a lib/types export back to its own source file, not a subdirectory', () => {
    // `lib/types` is the DECLARATION OUTPUT DIR, so `./lib/types/types.js` is
    // the emit of `src/types.ts`. Stripping only `./lib/` yields
    // `./src/types/types.ts`, one directory too deep — which resolves to
    // nothing and was wrong for three phases before anything noticed.
    const out = rewrite({
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './types': { types: './lib/types/types.d.ts', default: './lib/types/types.js' },
      './brand': { types: './lib/types/brand.d.ts', default: './lib/types/brand.js' },
    })
    expect(out['.']).toMatchObject({ default: './src/index.ts' })
    expect(out['./types']).toMatchObject({ default: './src/types.ts' })
    expect(out['./brand']).toMatchObject({ default: './src/brand.ts' })
  })

  it('leaves every built face pointing at its artifact', () => {
    // `./client` is read off disk by `client-modules` and served to a browser,
    // so source here would ship TSX to a runtime that cannot parse it.
    // `./typert` and `./remote` have no source at all — they are generated, and
    // the generator validates that the manifest names exactly these paths.
    const out = rewrite({
      './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
      './typert': { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' },
      './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
    })
    expect(out['./client']).toMatchObject({ default: './lib/client.js' })
    expect(out['./typert']).toMatchObject({ default: './lib/typert.host.js' })
    expect(out['./remote']).toMatchObject({ default: './lib/typert.remote-client.js' })
  })

  it('keeps declarations on lib/types even when upstream emits beside its JavaScript', () => {
    // One out-of-tree package does this. Our tsconfigs always emit declarations
    // to `lib/types`, so a `types` field naming `./lib/x.d.ts` would point at a
    // file we never write.
    const out = rewrite({ '.': { types: './lib/index.d.ts', default: './lib/index.js' } })
    expect(out['.']).toMatchObject({ types: './lib/types/index.d.ts', default: './src/index.ts' })
  })

  it('passes string-valued exports through untouched', () => {
    // `./src/*` and `./package.json` are paths, not conditions.
    const out = rewrite({ './src/*': './src/*', './package.json': './package.json' })
    expect(out['./src/*']).toBe('./src/*')
    expect(out['./package.json']).toBe('./package.json')
  })
})
