/**
 * Emit each vendored package's typert face artifacts.
 *
 * A handful of packages export `./typert` and `./remote` — the reflected
 * descriptor of what they contribute to the Cordis context, and the client-side
 * codec over it. Those files have **no source**: upstream generates them during
 * its tsdown pass, from a TypeScript program over the face aggregates, and
 * `lib/` is gitignored there.
 *
 * We do not run tsdown for the host half — the host runs from source under
 * `tsx` — so the generation has to happen on its own. This is that step: the
 * same `WorkspaceTypertGenerator` upstream's plugin calls, pointed at our
 * aggregate tsconfigs, writing the same `lib/typert.*` layout the manifests
 * name.
 *
 * Usage:  node --import tsx/esm scripts/typert-generate.mts [--check]
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkspaceTypertGenerator } from '@se373/typert-generator/src/workspace.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The analyzer looks for `tsconfig.host.json` and `tsconfig.client.json` at the
// root, which is why our two face aggregates carry those names rather than
// something layer-shaped: the generator has no option to be told otherwise.
const generator = new WorkspaceTypertGenerator(REPO)

/**
 * Only packages that actually export a face are generated for.
 *
 * Discovery is broader than emission: it reports every package whose public
 * surface *could* contribute, while only the ones whose manifest names
 * `./typert`, `./client/typert` or `./remote` have somewhere to put the result.
 * Generating for the rest is not merely wasted work — it type-checks packages
 * that legitimately do not compile yet, because what they are missing is the
 * artifact this step has not written.
 */
const FACE_EXPORTS = ['./typert', './client/typert', './remote']

const subjects = generator.discover()
  .filter((candidate) => {
    const manifest = JSON.parse(
      readFileSync(join(REPO, candidate.root, 'package.json'), 'utf8'),
    ) as { exports?: Record<string, unknown> }
    return FACE_EXPORTS.some(subpath => Object.hasOwn(manifest.exports ?? {}, subpath))
  })
  .map(candidate => candidate.package)

const artifacts = subjects.length === 0 ? [] : generator.generate(subjects)

let written = 0
const remoteless = new Set<string>()
for (const artifact of artifacts) {
  const output = join(REPO, artifact.packageRoot, 'lib')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  written += 1
  if (artifact.remote === undefined) {
    if (artifact.face === 'host') remoteless.add(output)
    continue
  }
  remoteless.delete(output)
  writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
  writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  written += 1
}
// A package that stops contributing a remote must not keep serving the last one
// it had: a stale codec is worse than a missing export, because it resolves.
for (const output of remoteless) {
  for (const name of ['typert.remote-client.js', 'typert.remote-client.d.ts', 'typert.remote-client.d.ts.map']) {
    rmSync(join(output, name), { force: true })
  }
}

console.log(`typert: emitted ${written} artifacts across ${new Set(artifacts.map(a => a.package)).size} packages`)
