/**
 * The phase-6a demonstrable: vectors exist.
 *
 * Six things happen, and each one is the phase's claim about a different part
 * of the design:
 *
 * 1. the registry knows which models exist and whether we have them;
 * 2. the mounted provider passes its seam conformance suite — including that it
 *    does not ignore the document/query role;
 * 3. a generation is created, bound to the embedder's identity, and written;
 * 4. a query retrieves, across languages, with no API key and no network;
 * 5. a second embedder in its own realm produces vectors the first generation
 *    refuses — the answer to "must the same model embed and query";
 * 6. the whole thing appears on the runtime graph by itself (I5).
 *
 * Requires the default model on disk:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/embed-demo/demo.mts
 */

import { resolve } from 'node:path'
import { assertEmbedderConformance } from '@se373/embedding'
import type { Embedder } from '@se373/embedding'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

// The generation files this writes are demo output and belong in a throwaway
// home. The 331 MB of weights are not: they are pinned, shared, and expensive,
// so the real cache root is read BEFORE the home is swapped and handed back
// through the registry's environment override.
const modelsRoot = dshHomePath('models')
useEphemeralHome('embed-demo')
process.env[MODELS_ROOT_ENV] ??= modelsRoot

const tree = await boot({
  configFile: resolve(import.meta.dirname, 'cordis.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})
const { ctx } = tree

// --- 1. what the registry knows ---------------------------------------------

console.log('\n=== declared models ===')
for (const row of ctx.modelRegistry.list()) {
  const state = await ctx.modelRegistry.resolve(row.id)
  console.log(
    `${state.status === 'ready' ? '✓' : '·'} ${row.id.padEnd(28)} `
    + `${String(row.dims).padStart(4)}d of [${row.mrlDims.join(', ')}]  ${row.license}`,
  )
}
console.log(`\ncandidates for a 256-dim generation: ${ctx.modelRegistry.candidates(256).map(r => r.id).join(', ')}`)
console.log(`candidates for a 384-dim generation: ${ctx.modelRegistry.candidates(384).map(r => r.id).join(', ')}`)

// --- 2. does the provider actually honour the seam? -------------------------

const embedder = ctx.embedder
console.log('\n=== mounted embedder ===')
console.log(`model       ${embedder.identity.modelId} @ ${embedder.identity.revision.slice(0, 7)}`)
console.log(`width       ${embedder.identity.dims} of ${embedder.identity.nativeDims} native`)
console.log(`templates   ${JSON.stringify(embedder.identity.templates)}`)
console.log(`fingerprint ${embedder.identity.fingerprint}`)
console.log(`readiness   ${embedder.readiness}`)

if (embedder.readiness !== 'ready') {
  console.error(`\n${(embedder as { blockedReason?: string }).blockedReason ?? 'embedder is blocked'}`)
  console.error(`(looked in ${modelsRoot})`)
  process.exit(1)
}

console.log('\nrunning the conformance suite…')
await assertEmbedderConformance(embedder)
console.log('conformance: pass (shape, norm, determinism, role-sensitivity)')

// --- 3. write a generation ---------------------------------------------------

const CORPUS = [
  { key: 'mars', text: 'Mars is often called the Red Planet because iron oxide covers its surface.' },
  { key: 'venus', text: "Venus is Earth's twin in size and is the hottest planet in the solar system." },
  { key: 'jupiter', text: 'Jupiter is the largest planet and its Great Red Spot is a centuries-old storm.' },
  { key: 'saturn', text: 'Saturn is encircled by bright rings made mostly of ice particles.' },
  { key: 'cordis', text: 'Cordis is a plugin framework where every registration is a reversible effect.' },
  { key: 'seam', text: 'A seam is a service name with exactly one provider, chosen by a config row.' },
]

const generation = await ctx.vectorStore.create(embedder.identity)
console.log(`\n=== generation ${generation.id} ===`)
console.log(`bound to ${generation.modelId} at ${generation.dims}d, status ${generation.status}`)

const started = Date.now()
const documents = await embedder.embed(CORPUS.map(entry => entry.text), 'document')
console.log(`embedded ${CORPUS.length} documents in ${Date.now() - started} ms`)

await ctx.vectorStore.upsert(generation.id, CORPUS.map(({ key, text }) => ({ key, text })), documents)
await ctx.vectorStore.activate(generation.id)
const active = await ctx.vectorStore.active()
console.log(`active generation: ${active?.id} (${active?.records} records, status ${active?.status})`)

// --- 4. retrieve, across languages -------------------------------------------

/** Embed one query and print its top hits. */
async function ask(embedderToUse: Embedder, question: string, k = 3): Promise<void> {
  const embedded = await embedderToUse.embed([question], 'query')
  const hits = await ctx.vectorStore.query(generation.id, embedded, k)
  console.log(`\n? ${question}`)
  for (const hit of hits) {
    console.log(`   ${hit.distance.toFixed(4)}  ${hit.key.padEnd(8)} ${hit.text?.slice(0, 62)}`)
  }
}

console.log('\n=== retrieval ===')
await ask(embedder, 'Which planet looks red?')
await ask(embedder, 'What holds the rings of ice?')
// The multilingual claim, exercised rather than asserted: a Vietnamese question
// against an English-only corpus. If the model or the templates were wrong this
// would rank by nothing in particular, and nothing would report an error.
await ask(embedder, 'Hành tinh nào có màu đỏ?')
await ask(embedder, 'Một seam là gì?')

// --- 5. the refusal ----------------------------------------------------------

console.log('\n=== the refusal ===')
const narrowFiber = [...ctx.loader.entries()].find(entry => entry.id.endsWith('narrow-embedder'))
const narrow = narrowFiber?.fiber?.ctx.embedder as Embedder | undefined
if (narrow === undefined) {
  console.log('(narrow realm did not mount; skipping)')
} else {
  console.log(`realm "narrow" embedder: ${narrow.identity.dims}d, fingerprint ${narrow.identity.fingerprint.slice(0, 12)}…`)
  console.log(`root  embedder:          ${embedder.identity.dims}d, fingerprint ${embedder.identity.fingerprint.slice(0, 12)}…`)
  console.log('same weights, same revision, different stored width — and therefore different models.\n')
  const foreign = await narrow.embed(['Which planet looks red?'], 'query')
  try {
    await ctx.vectorStore.query(generation.id, foreign, 3)
    console.error('!! the store accepted vectors from a different model. That is the bug this guard exists for.')
    process.exitCode = 1
  } catch (error) {
    console.log(`refused: ${(error as Error).message}`)
  }
}

// --- 6. it is on the graph without anyone adding it --------------------------

console.log('\n=== on the runtime graph ===')
for (const node of ctx.runtimeGraph.snapshot().nodes) {
  if (!/embed|vector-store|sqlite-vec|model-registry/.test(node.moduleName)) continue
  const unmet = node.edges.filter(edge => !edge.satisfied).map(edge => edge.service)
  console.log(
    `${node.entryId.padEnd(34)} ${(node.realm || 'root').padEnd(10)} ${String(node.lifecycle).padEnd(8)}`
    + (unmet.length > 0 ? `  unsatisfied: ${unmet.join(', ')}` : ''),
  )
}

await tree.stop()
