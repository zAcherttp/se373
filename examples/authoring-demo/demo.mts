/**
 * Phase 6d's end condition: an agent-authored block passes its conformance
 * suite and hot-swaps into a running agent — no restart, one config-row edit.
 *
 * The arc, in order:
 *
 * 1. an internal-knowledge agent is fabricated over a corpus whose documents
 *    carry YAML front matter, and its retrieval shows the front matter
 *    polluting the indexed passages — a real limitation the shipped chunker's
 *    README admits to;
 * 2. a **broken** fork is authored first: it typechecks and drops text, and the
 *    conformance suite refuses it with the rule it broke — the suite output is
 *    an ordinary result, which is what makes repair a loop iteration (§6.5);
 * 3. the corrected fork — strip front matter, then chunk as the parent does —
 *    passes gate → write → syntax → typecheck → conformance and is certified;
 *    the registry's mount policy flips from refusal to allowed (I7);
 * 4. the running agent's chunker row is pointed at the fork — a config-row
 *    edit (I3), the running tree reloads that one row, nothing restarts;
 * 5. the pipeline reports itself stale (the chunker's digest changed — computed,
 *    never declared), the gated rebuild is approved, and the same question now
 *    retrieves passages with no front matter in them: the agent's answers flow
 *    through code the model wrote.
 *
 * Requires the default model:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/authoring-demo/demo.mts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { describePlan } from '@se373/knowledge'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

const modelsRoot = dshHomePath('models')
useEphemeralHome('authoring-demo')
process.env[MODELS_ROOT_ENV] ??= modelsRoot

// A corpus with front matter, so the fork has something real to fix.
const corpus = mkdtempSync(join(tmpdir(), 'se373-fm-corpus-'))
process.once('exit', () => { rmSync(corpus, { recursive: true, force: true }) })
for (const [name, title, body] of [
  ['seams.md', 'Seams', 'A seam is a service name with exactly one provider, chosen by a config row. '.repeat(6)],
  ['staleness.md', 'Staleness', 'Index staleness is computed from a fingerprint, never declared by a flag. '.repeat(6)],
  ['generations.md', 'Generations', 'A destructive change builds a new generation alongside, flips, then drops. '.repeat(6)],
]) {
  writeFileSync(join(corpus, name!), [
    '---', `title: ${title}`, 'tags: [se373, demo]', 'draft: false', '---', '', `# ${title}`, '', body,
  ].join('\n'))
}

const tree = await boot({
  configFile: resolve(import.meta.dirname, 'cordis.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})
const { ctx } = tree
await ctx.get('loader')?.await()

// --- 1. fabricate, ingest, and see the pollution ------------------------------

console.log('=== fabricate over a front-mattered corpus ===')
const plan = await ctx.builder.plan({
  recipe: 'recipe.internal-knowledge',
  blocks: [
    'block.model-registry', 'block.corpus-fs', 'block.chunker-markdown', 'block.embedder-onnx-local',
    'block.vs-sqlite-vec', 'block.rerank-none', 'block.knowledge-dedup', 'block.knowledge',
    'block.tool-knowledge-search',
  ],
})
ctx.planGate.approve(plan.planId!)
const agent = await ctx.builder.fabricate(plan.digest)

const rowId = (suffix: string) => `${agent.spec.name}-v${agent.spec.version}.${suffix}`
const corpusEntry = [...ctx.loader.entries()].find(entry => entry.id === rowId('block.corpus-fs'))!
await corpusEntry.update({ ...corpusEntry.options, config: { roots: [corpus], extensions: ['.md'] } })

const pipeline = [...ctx.loader.entries()].find(entry => entry.id === rowId('block.knowledge'))!.fiber!.ctx.knowledgePipeline

/** Gated ingest: propose, approve, run. */
async function ingest() {
  const refused = await pipeline.ingest().then(() => null, (error: unknown) => error) as { planId: string }
  ctx.planGate.approve(refused.planId)
  return pipeline.ingest({ planId: refused.planId })
}
const first = await ingest()
console.log(`ingested ${first.chunks.written} chunks (${first.mode})`)

const QUESTION = 'What is a seam?'
const before = await pipeline.retrieve(QUESTION, { k: 1 })
console.log(`\n? ${QUESTION}`)
console.log(`   ${JSON.stringify(before[0]!.text!.slice(0, 90))}`)
const polluted = before.some(hit => hit.text!.includes('tags: [se373'))
console.log(`front matter in the retrieved passage: ${polluted}`)

// --- 2. a broken fork is refused with the rule it broke ------------------------

console.log('\n=== authoring: the broken attempt ===')
const LOSSY = `import { Chunker, buildChunk } from '@se373/chunker'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'

/** "Strips front matter" by keeping only the second half of the document. */
export default class Halver extends Chunker {
  readonly chunkerRef = 'halver-v1'
  describe(): string { return 'half the document, confidently' }
  chunk(document: Document): Chunk[] {
    return [buildChunk(document, 0, document.text.slice(Math.floor(document.text.length / 2)))]
  }
}
`
const broken = await (async () => {
  const refused = await ctx.authoring
    .author({ forkOf: 'block.chunker-markdown', name: 'front-matter-chunker', files: { 'index.ts': LOSSY } })
    .then(() => null, (error: unknown) => error) as { planId: string }
  ctx.planGate.approve(refused.planId)
  return ctx.authoring.author({
    forkOf: 'block.chunker-markdown', name: 'front-matter-chunker', files: { 'index.ts': LOSSY }, planId: refused.planId,
  })
})()
console.log(`status ${broken.status} at stage ${broken.stage}`)
console.log(`suite said: ${broken.output!.split('\n')[0]}`)
console.log(`mountable: ${JSON.stringify(ctx.blocks.mountable('front-matter-chunker'))}`)

// --- 3. the corrected fork is certified ----------------------------------------

console.log('\n=== authoring: the corrected fork ===')
const FIXED = `import { MarkdownChunker } from '@se373/chunker-markdown'
import type { Chunk } from '@se373/chunker'
import type { Document } from '@se373/corpus'
import { stageDigest } from '@se373/digest'

/** The shipped markdown chunker, with YAML front matter stripped first. */
export default class FrontMatterChunker extends MarkdownChunker {
  override readonly chunkerRef = stageDigest('front-matter-chunker', { parent: 'chunker-markdown' })

  override describe(): string {
    return 'markdown headings, front matter stripped (authored fork)'
  }

  override chunk(document: Document): Chunk[] {
    const text = document.text.replace(/^---\\n[\\s\\S]*?\\n---\\n/, '')
    return super.chunk({ ...document, text, contentHash: document.contentHash })
  }
}
`
const authored = await (async () => {
  const refused = await ctx.authoring
    .author({ forkOf: 'block.chunker-markdown', name: 'front-matter-chunker', files: { 'index.ts': FIXED } })
    .then(() => null, (error: unknown) => error) as { planId: string }
  ctx.planGate.approve(refused.planId)
  return ctx.authoring.author({
    forkOf: 'block.chunker-markdown', name: 'front-matter-chunker', files: { 'index.ts': FIXED }, planId: refused.planId,
  })
})()
console.log(`status ${authored.status}: ${authored.passed.join(' → ')}`)
if (authored.status !== 'certified') {
  console.error(`!! ${authored.stage}: ${authored.output}`)
  process.exit(1)
}
console.log(`block ${authored.block!.id}@${authored.block!.version}, origin ${authored.block!.origin}, forked from ${authored.block!.forkedFrom}`)
console.log(`mountable: ${JSON.stringify(ctx.blocks.mountable('front-matter-chunker'))}`)

// --- 4. the config-row swap ----------------------------------------------------

console.log('\n=== the swap ===')
const chunkerEntry = [...ctx.loader.entries()].find(entry => entry.id === rowId('block.chunker-markdown'))!
await chunkerEntry.update({ ...chunkerEntry.options, name: join(authored.dir!, 'index.ts') })
console.log(`row ${chunkerEntry.id} now names ${chunkerEntry.options.name}`)

const status = await pipeline.status()
console.log(`pipeline says: ${status.stale === null ? 'not stale !!' : describePlan(status.stale)}`)
console.log(`chunker now describes itself as: ${status.describe['chunker']}`)

// --- 5. rebuild through authored code, and ask again ---------------------------

console.log('\n=== rebuild through the fork ===')
const second = await ingest()
console.log(`ingested ${second.chunks.written} chunks (${second.mode})`)
const after = await pipeline.retrieve(QUESTION, { k: 1 })
console.log(`\n? ${QUESTION}`)
console.log(`   ${JSON.stringify(after[0]!.text!.slice(0, 90))}`)
const clean = !after.some(hit => hit.text!.includes('tags: [se373'))
console.log(`front matter in the retrieved passage: ${!clean}`)
if (polluted && clean) {
  console.log('\nthe running agent now answers through code the model wrote, and the index is cleaner for it.')
} else {
  console.error('!! the fork did not change what retrieval returns')
  process.exitCode = 1
}

await ctx.builder.dismantle(agent.entryId)
ctx.authoring.discard('front-matter-chunker')
await tree.stop()
