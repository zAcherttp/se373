/**
 * Boot `examples/realm-split/cordis.yml` and print what each consumer's
 * `loggerJsonl` injection actually resolved to.
 *
 * The assertion at the end is the whole point: the two consumers declare the
 * same service name and must reach two different providers. A name-keyed edge
 * algorithm passes every other check in this repo and fails this one.
 */

import { resolve } from 'node:path'
import { boot } from '../../apps/cli/src/boot.ts'
import { renderSnapshot } from '../../packages/runtime/tool-graph-inspect/src/render.ts'

const tree = await boot({
  configFile: resolve(import.meta.dirname, 'cordis.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})

const snapshot = tree.ctx.runtimeGraph.snapshot()
console.log(renderSnapshot(snapshot))

// Ids carry the including tree's prefix (`<treeId>:alpha-consumer`), so match
// on the suffix the config actually wrote.
const edgeOf = (id: string) => snapshot.nodes
  .find(node => node.entryId.endsWith(id))
  ?.edges.find(edge => edge.service === 'loggerJsonl')

const alpha = edgeOf('alpha-consumer')
const beta = edgeOf('beta-consumer')

console.log('\nalpha-consumer loggerJsonl →', alpha)
console.log('beta-consumer  loggerJsonl →', beta)

const distinct = alpha?.satisfied === true
  && beta?.satisfied === true
  && alpha.providerEntryId?.endsWith('alpha-sink') === true
  && beta.providerEntryId?.endsWith('beta-sink') === true

console.log(distinct
  ? '\nPASS — one service name, two realms, two distinct edges.'
  : '\nFAIL — the two realms collapsed into one edge.')

await tree.stop()
process.exit(distinct ? 0 : 1)
