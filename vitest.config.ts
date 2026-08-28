import { defineConfig } from 'vitest/config'

// Cordis's Loader imports plugin modules through Node's own resolver, not
// through vitest's transform pipeline, so a worker that starts without tsx
// registered hits Node's strip-only TypeScript mode and rejects vendored
// sources that use parameter properties.
//
// `poolOptions.forks.execArgv` is applied too late to register a module hook.
// NODE_OPTIONS is inherited by the workers vitest spawns, and setting it here
// rather than in the npm script keeps a bare `npx vitest` working and stays
// cross-platform.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--import tsx/esm']
  .filter(Boolean)
  .join(' ')

export default defineConfig({
  test: {
    // Vendored packages carry specs too: they are what catches a bad rescope.
    include: [
      'packages/*/*/tests/**/*.spec.ts',
      'apps/*/tests/**/*.spec.ts',
      'vendor/dsh/*/*/tests/**/*.spec.ts',
      'scripts/tests/**/*.spec.ts',
    ],
    environment: 'node',
  },
})
