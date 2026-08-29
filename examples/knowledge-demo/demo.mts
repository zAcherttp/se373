/**
 * The phase-6b demonstrable: the knowledge plane answers, and refuses.
 *
 * Seven things happen, each a claim about a different part of §5:
 *
 * 1. four seams compose into one pipeline, and the generation key is derived
 *    from all four;
 * 2. an ingest crawls this repository's own documentation, chunks it at its
 *    headings, embeds it and stores it;
 * 3. retrieval answers, including across languages;
 * 4. a second ingest with nothing changed skips every document — incremental
 *    ingest by content hash;
 * 5. a document that shrinks has its orphaned chunks swept;
 * 6. changing the *chunker* re-chunks; changing only the *embedder* reads
 *    chunks back from the previous generation and never touches the corpus —
 *    §5.5's positional cascade;
 * 7. a query against a stale index fails closed rather than answering.
 *
 * Requires the default model:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/knowledge-demo/demo.mts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { describePlan } from '@se373/knowledge'
import type { IngestEnd, IngestStart } from '@se373/knowledge'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

const modelsRoot = dshHomePath('models')
useEphemeralHome('knowledge-demo')
process.env[MODELS_ROOT_ENV] ??= modelsRoot

// A small corpus of our own making, so steps 4-6 can change a document without
// editing the repository. The real docs are added as a second root by the
// config; this one is where the mutations happen.
const scratch = mkdtempSync(join(tmpdir(), 'se373-corpus-'))
process.env['SE373_DEMO_CORPUS'] = scratch
const shrinking = join(scratch, 'shrinking.md')
writeFileSync(join(scratch, 'invariants.md'), [
  '# The nine invariants',
  '',
  '## I3 — a deployment choice is a config row',
  '',
  'Swapping a stage is a config-row edit, never a code edit. A row you can see',
  'is a row you can turn on; a row that was deleted is not.',
  '',
  '## I5 — the graph is derived from the live runtime',
  '',
  'The runtime graph is a projection of the loader and fiber trees, so it cannot',
  'drift from the runtime: there is no second source for it to drift from.',
  '',
].join('\n'))
writeFileSync(shrinking, [
  '# A document that will shrink',
  '',
  '## First section',
  '',
  'This section survives the edit and should still be retrievable afterwards. '.repeat(12),
  '',
  '## Second section',
  '',
  'This section is deleted halfway through the demo. If its chunks are still in '
  + 'the index afterwards, the orphan sweep did not run. '.repeat(12),
  '',
  '## Third section',
  '',
  'This one is deleted too, for the same reason, and says something quite '
  + 'different so a stale hit would be obvious. '.repeat(12),
  '',
].join('\n'))

const tree = await boot({
  configFile: resolve(import.meta.dirname, 'demo.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})
const { ctx } = tree

// The durable ingest events (§5.4). Subscribed before anything runs, because an
// event stream you join late is one you cannot replay.
ctx.on('ingest/start', (event: IngestStart) => {
  console.log(`\n  ingest ${event.ingestId.slice(0, 8)} · ${event.mode} · gen ${event.generationId}`)
})
ctx.on('ingest/end', (event: IngestEnd) => {
  console.log(
    `  ${event.status} · ${event.documents.seen} docs (${event.documents.changed} changed, `
    + `${event.documents.skipped} skipped) · ${event.chunks.written} chunks written, `
    + `${event.chunks.removed} swept · ${event.durationMs} ms`,
  )
})

// --- 1. the composition ------------------------------------------------------

console.log('=== the pipeline ===')
const before = await ctx.knowledgePipeline.status()
for (const [stage, description] of Object.entries(before.describe)) {
  console.log(`  ${stage.padEnd(9)} ${description}`)
}
console.log(`  ${'genKey'.padEnd(9)} ${before.genKey.slice(0, 16)}…`)
console.log(`  ${'stages'.padEnd(9)} ${Object.entries(before.stages).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(' ')}`)

// --- 2. ingest ---------------------------------------------------------------

console.log('\n=== ingest ===')
const first = await ctx.knowledgePipeline.ingest()

// --- 3. retrieve -------------------------------------------------------------

/** Ask, and print the passages. */
async function ask(question: string, k = 3): Promise<void> {
  const hits = await ctx.knowledgePipeline.retrieve(question, { k })
  console.log(`\n? ${question}`)
  for (const hit of hits) {
    const text = (hit.text ?? '').replace(/\s+/g, ' ').slice(0, 96)
    console.log(`   ${hit.distance.toFixed(3)}  ${(hit.title ?? hit.key).slice(0, 44).padEnd(44)} ${text}`)
  }
}

console.log('\n=== retrieval ===')
await ask('What decides whether something is a seam or a waterfall event?')
await ask('Why is index staleness computed instead of declared?')
// Cross-lingual, against a corpus written entirely in English. This one returns
// the same top passages as its English equivalent, which is the claim.
await ask('Cordis là gì?')
// And this one does not. The corpus has no Vietnamese in it, so a question
// built from an ad-hoc translation of domain jargon -- "chỉ số lỗi thời" for
// "stale index" is mine, not anyone's usage -- lands nowhere near the passage
// that answers it, while the English form ranks it first. Left in the demo on
// purpose: it is the concrete reason D6 asks for a Vietnamese question set
// somebody wrote, rather than a translation of the English one.
await ask('Tại sao chỉ số lỗi thời được tính toán chứ không phải khai báo?')

// --- 4. incremental: nothing changed -----------------------------------------

console.log('\n=== ingest again, nothing changed ===')
const second = await ctx.knowledgePipeline.ingest()
console.log(
  second.documents.changed === 0
    ? `  every document skipped by content hash; ${second.durationMs} ms against ${first.durationMs} ms`
    : `  !! ${second.documents.changed} documents were re-embedded and should not have been`,
)

// --- 5. a document shrinks ---------------------------------------------------

console.log('\n=== a document shrinks ===')
writeFileSync(shrinking, [
  '# A document that will shrink',
  '',
  '## First section',
  '',
  'This section survives the edit and should still be retrievable afterwards. '.repeat(12),
  '',
].join('\n'))
const third = await ctx.knowledgePipeline.ingest()
console.log(`  ${third.chunks.removed} orphaned chunk(s) swept`)
const stale = await ctx.knowledgePipeline.retrieve('this section is deleted halfway through the demo', { k: 2 })
console.log(
  stale.some(hit => hit.documentId.endsWith('shrinking.md') && (hit.text ?? '').includes('deleted halfway'))
    ? '  !! a deleted section is still being retrieved'
    : '  the deleted sections are gone from the index',
)

// --- 6. the positional cascade -----------------------------------------------

console.log('\n=== the cascade ===')
const chunkerEntry = [...ctx.loader.entries()].find(entry => entry.id.endsWith('chunker'))!
const embedderEntry = [...ctx.loader.entries()].find(entry => entry.id.endsWith(':embedder'))!

await chunkerEntry.update({ ...chunkerEntry.options, config: { size: 500, overlap: 80, minSize: 150 } })
const afterChunker = await ctx.knowledgePipeline.status()
console.log(`  chunker resized  → ${afterChunker.stale === null ? 'no change detected !!' : describePlan(afterChunker.stale)}`)
const rechunked = await ctx.knowledgePipeline.ingest()
console.log(`  rebuilt as '${rechunked.mode}' (crawled ${rechunked.documents.seen} documents)`)

await embedderEntry.update({ ...embedderEntry.options, config: { dims: 256, batchSize: 8 } })
const afterEmbedder = await ctx.knowledgePipeline.status()
console.log(`  embedder narrowed → ${afterEmbedder.stale === null ? 'no change detected !!' : describePlan(afterEmbedder.stale)}`)
const reembedded = await ctx.knowledgePipeline.ingest()
console.log(
  reembedded.mode === 're-embed'
    ? `  rebuilt as 're-embed': ${reembedded.chunks.written} chunks read back from the previous generation, corpus never touched`
    : `  !! rebuilt as '${reembedded.mode}' — the cascade re-crawled a corpus that did not move`,
)
await ask('Why is index staleness computed instead of declared?', 2)

// --- 7. fail closed ----------------------------------------------------------

console.log('\n=== a stale index refuses ===')
await embedderEntry.update({ ...embedderEntry.options, config: { dims: 768, batchSize: 8 } })
try {
  await ctx.knowledgePipeline.retrieve('anything at all')
  console.error('  !! answered from an index a different pipeline wrote')
  process.exitCode = 1
} catch (error) {
  console.log(`  refused: ${(error as Error).message}`)
}

const generations = await ctx.vectorStore.list()
console.log(`\n${generations.length} generation(s) on disk:`)
for (const generation of generations) {
  console.log(
    `  ${generation.id}  ${String(generation.records).padStart(5)} chunks  ${generation.dims}d  `
    + `${generation.status.padEnd(8)} key ${generation.labels['genKey']?.slice(0, 12) ?? '(none)'}…`,
  )
}

await tree.stop()
rmSync(scratch, { recursive: true, force: true })
