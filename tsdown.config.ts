/**
 * Root tsdown config: the browser half only.
 *
 * Upstream runs two faces here. The host face bundles each package's node half
 * into `lib/` and runs the typert generator on the way; we need neither — our
 * host runs from source under `tsx`, and the codegen is its own step
 * (`scripts/typert-generate.mts`) precisely because we do not have a host
 * bundle to hang it off.
 *
 * What is left is the face that cannot be skipped. `client-modules` resolves
 * each UI plugin's `./client` export, reads the file to hash it, and serves
 * those bytes to a browser. Every package-local `tsdown.config.ts` is a call
 * into `vendor/dsh/client/tsdown.client.ts`, which decides the module-table
 * externals, the purity gate and the CSS pipeline; this file only says which
 * packages to walk.
 */
import { defineConfig } from 'tsdown'

export default defineConfig({
  // Ours as well as theirs: a UI plugin of ours is a client bundle like any
  // other, and `client-modules` cannot tell the difference.
  workspace: ['vendor/dsh/*/*', 'packages/*/*'],
  // Package-local configs own every entry. A root entry here would emit a
  // second, unconfigured artifact into each package's lib/.
  entry: '',
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
