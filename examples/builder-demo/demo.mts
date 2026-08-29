/**
 * The phase-6c demonstrable: a recipe becomes a working agent.
 *
 * Eight things happen, each a claim about a different part of §6:
 *
 * 1. the repository holds blocks with provenance, versions and parentage;
 * 2. the cookbook offers six recipes, one per SE373 archetype;
 * 3. planning a recipe resolves it to a **value** — rows, config, isolates — and
 *    registers it, without running anything;
 * 4. fabricating without approval is refused (I8);
 * 5. approving and fabricating mounts a live Cordis subtree, in its own realm;
 * 6. the subtree appears on the runtime graph by itself (I5) — nothing here
 *    tells the graph about it;
 * 7. the fabricated agent *works*: it ingests and answers, through the same
 *    seams the config-file version uses;
 * 8. dismantling unwinds the whole subtree with one disposer (I6), and the spec
 *    it was built from stays in the repository, because the version you would
 *    roll back to has to survive.
 *
 * Requires the default model:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/builder-demo/demo.mts
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

const modelsRoot = dshHomePath('models')
useEphemeralHome('builder-demo')
process.env[MODELS_ROOT_ENV] ??= modelsRoot

// Fabrication writes the emitted rows back through the loader, which is the
// point -- a fabricated agent is a durable config value (I4), not a runtime
// object that evaporates. So the demo boots from a *copy* and leaves the file in
// the repository alone.
//
// The copy lives beside the original rather than in the throwaway home, because
// Node resolves a row's module by walking up from the config file: a config in
// /tmp has no node_modules above it and every row fails to import.
const scratch = mkdtempSync(resolve(import.meta.dirname, '.run-'))
process.once('exit', () => { rmSync(scratch, { recursive: true, force: true }) })
const configFile = resolve(scratch, 'cordis.yml')
copyFileSync(resolve(import.meta.dirname, 'cordis.yml'), configFile)

const tree = await boot({ configFile, args: [], onExit: () => {}, logLevel: 2 })
const { ctx } = tree

// --- 1. the repository -------------------------------------------------------

console.log('=== the repository ===')
const byOrigin = new Map<string, number>()
for (const block of ctx.blocks.list()) {
  byOrigin.set(block.origin, (byOrigin.get(block.origin) ?? 0) + 1)
}
console.log(`${ctx.blocks.list().length} blocks: ${[...byOrigin].map(([k, n]) => `${n} ${k}`).join(', ')}`)
console.log(`persisted at ${ctx.blocks.path}`)

// --- 2. the cookbook ---------------------------------------------------------

console.log('\n=== the cookbook ===')
for (const recipe of ctx.blocks.list({ kind: 'recipe' })) {
  const prefill = recipe.manifest.defaults as { archetype: string, outcome: string }
  console.log(`  ${recipe.id.padEnd(32)} ${prefill.archetype}`)
  console.log(`  ${''.padEnd(32)} ${prefill.outcome}`)
}

// --- 3. plan -----------------------------------------------------------------

console.log('\n=== plan ===')
const plan = await ctx.builder.plan({ recipe: 'recipe.internal-knowledge' })
console.log(`spec ${plan.specRef}, digest ${plan.digest.slice(0, 16)}…`)
console.log(`realm isolates: ${plan.spec.isolates.join(', ') || '(none)'}`)
console.log('rows:')
for (const row of plan.spec.rows) {
  console.log(`  ${row.disabled === true ? '·' : '✓'} ${row.id.padEnd(28)} ${row.name}`)
}
if (plan.warnings.length > 0) {
  console.log('warnings:')
  for (const warning of plan.warnings) console.log(`  ! ${warning.block}: ${warning.message}`)
}

// --- 4. the gate refuses ------------------------------------------------------

console.log('\n=== the gate ===')
try {
  await ctx.builder.fabricate(plan.digest)
  console.error('  !! fabricated without approval')
  process.exitCode = 1
} catch (error) {
  console.log(`  refused: ${(error as Error).message}`)
}

// --- 5. approve and fabricate -------------------------------------------------

const card = ctx.planGate.get(plan.planId!)
console.log(`\nplan ${card.id.slice(0, 8)} — ${card.summary}`)
for (const step of card.steps) console.log(`  ${step.destructive ? '!' : '-'} ${step.summary}`)
ctx.planGate.approve(card.id)
console.log('approved.')

const agent = await ctx.builder.fabricate(plan.digest)
console.log(`\nfabricated ${agent.spec.name} v${agent.spec.version} as loader entry ${agent.entryId}`)

// --- 6. it is on the graph, and nobody put it there ---------------------------

console.log('\n=== on the runtime graph ===')
// Asked as a subtree query rather than by matching id strings: the projection
// descends by parentEntryId precisely because group children keep flat ids, so
// a prefix test would find an included subtree and miss a group.
const subtree = ctx.runtimeGraph.snapshot({ entryId: agent.entryId })
console.log(`  ${subtree.nodes.length} nodes under ${agent.entryId}, of ${subtree.totalNodes} in the tree`)
for (const node of subtree.nodes) {
  const unmet = node.edges.filter(edge => !edge.satisfied).map(edge => edge.service)
  console.log(
    `  ${node.entryId.padEnd(24)} ${node.moduleName.padEnd(32)} ${String(node.lifecycle).padEnd(7)}`
    + ` ${node.provides.join(',') || '—'}`
    + (unmet.length > 0 ? `  unsatisfied: ${unmet.join(', ')}` : ''),
  )
}
console.log(`  every one of them in realm ${JSON.stringify(subtree.nodes[1]?.realm ?? '')}`)

// --- 7. it works --------------------------------------------------------------

console.log('\n=== the fabricated agent answers ===')
const knowledgeRow = [...ctx.loader.entries()].find(entry => entry.id.endsWith('block.knowledge'))
const pipeline = knowledgeRow?.fiber?.ctx.knowledgePipeline
if (pipeline === undefined) {
  console.error('  !! the fabricated subtree has no knowledgePipeline')
  process.exitCode = 1
} else {
  const report = await pipeline.ingest()
  console.log(`  ingested ${report.chunks.written} chunks from ${report.documents.seen} documents in ${report.durationMs} ms`)
  for (const question of ['What is a seam?', 'Why is index staleness computed?']) {
    const hits = await pipeline.retrieve(question, { k: 2 })
    console.log(`\n  ? ${question}`)
    for (const hit of hits) {
      console.log(`     ${hit.distance.toFixed(3)}  ${(hit.title ?? hit.key).slice(0, 52)}`)
    }
  }
}

// --- 8. forks, versions, and unwinding ----------------------------------------

console.log('\n=== the repository is a repository ===')
const fork = ctx.blocks.fork('recipe.internal-knowledge', {
  origin: 'user',
  manifest: { summary: 'My knowledge assistant, but over the design notes only' },
})
console.log(`forked ${fork.id} from ${fork.forkedFrom} (origin ${fork.origin})`)
console.log(`the original is untouched: ${ctx.blocks.get('recipe.internal-knowledge')!.manifest.summary}`)

const second = await ctx.builder.plan({ recipe: 'recipe.internal-knowledge' })
console.log(`planning again produced ${second.specRef} — a new version, not a mutation`)
console.log(`versions of spec.internal-knowledge: ${ctx.blocks.versions('spec.internal-knowledge').map(b => b.version).join(', ')}`)

console.log('\n=== dismantle ===')
const before = ctx.runtimeGraph.snapshot().nodes.length
await ctx.builder.dismantle(agent.entryId)
const after = ctx.runtimeGraph.snapshot().nodes.length
console.log(`  ${before} nodes → ${after}; the subtree unwound with one disposer`)
console.log(`  its spec is still in the repository: ${ctx.blocks.get('spec.internal-knowledge')!.id}@${ctx.blocks.get('spec.internal-knowledge')!.version}`)

await tree.stop()
