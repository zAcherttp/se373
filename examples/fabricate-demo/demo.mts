/**
 * Phase 6d, step 2: a fabricated agent is an *agent* — it has its own persona,
 * its own tools, its own workspace posture, and you talk to it.
 *
 * Two agents are fabricated into one process:
 *
 * - **internal-knowledge** — the plane as subtree rows, `search_knowledge` and
 *   a persona as its generated preset. Asked a question, it retrieves and
 *   answers.
 * - **code-review** — no subsystem at all: filesystem tools and a persona over
 *   a **read-only** realm pointed at this repository. Asked to review a file,
 *   it reads and answers — and its `write` tool is in the catalog and refused.
 *
 * Two at once is what makes the isolation guard non-theoretical: two rosters
 * named `agentPresets`, two seam sets, one process, no collision. And the main
 * roster still lists exactly the two shipped presets — the fabricated personas
 * are scoped to their agents alone.
 *
 * The whole path is real except the model: sessions are created the way the
 * gateway creates them, the presets mount through upstream's own roster, the
 * tools execute against the real pipeline and the real (read-only) filesystem.
 * The mock supplies only the decisions.
 *
 * Requires the default model:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/fabricate-demo/demo.mts
 */

import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { startMockLlmServer } from '@se373/llm-mock-server'
import { SessionId } from '@se373/session'
import { installModelSelection } from '@se373/agent'
import type { ModelSelectionRef } from '@se373/agent'
import { createUserMessage } from '@se373/llm'
import type { Context } from '@se373/cordis'
import type { AgentPresets } from '@se373/agent-presets'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

const modelsRoot = dshHomePath('models')
useEphemeralHome('fabricate-demo')
process.env[MODELS_ROOT_ENV] ??= modelsRoot
process.env.SE373_PERMISSION_MODE = 'danger-full-access'
process.env.DEEPSEEK_API_KEY ??= 'mock-key'

const QUESTION = 'What decides whether a stage is a seam or a waterfall event?'

// One mock serves both agents. First conversation: call search_knowledge, then
// answer. Later conversations: plain answers -- what those turns prove is
// carried by the request bodies the server records (each agent presents ITS
// tool catalog), not by scripted calls.
const server = await startMockLlmServer({
  sequence: ['tool_call_success', 'success'],
  repeatLast: true,
  toolName: 'search_knowledge',
  toolArguments: JSON.stringify({ query: QUESTION, k: 3 }),
  successText: 'Cardinality decides it: pick-one is a seam; stack-many is a waterfall event.',
})
process.env.SE373_LLM_BASE_URL = server.baseURL

const tree = await boot({
  configFile: resolve(import.meta.dirname, 'cordis.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})
const { ctx } = tree
await ctx.get('loader')?.await()

/** Fabricate one recipe, approving both cards. */
async function fabricate(recipe: string, workspaceRoot?: string) {
  const plan = await ctx.builder.plan({ recipe, ...workspaceRoot === undefined ? {} : { workspaceRoot } })
  console.log(`\nplan ${plan.spec.name} v${plan.spec.version} — ${plan.spec.rows.length} subsystem rows, `
    + `${plan.spec.agentRows.length} agent rows, filesystem ${plan.spec.filesystem ?? 'none'}`)
  for (const step of ctx.planGate.get(plan.planId!).steps) {
    console.log(`  ${step.destructive ? '!' : '-'} ${step.summary}`)
  }
  ctx.planGate.approve(plan.planId!)
  return ctx.builder.fabricate(plan.digest)
}

/** Create a session joined to a fabricated agent's preset, ask, and wait. */
async function converse(entryId: string, presetId: string, text: string): Promise<string> {
  const presets = ctx.builder.presetsOf(entryId) as AgentPresets
  const selection = ctx.agentDefaultModel.currentSelection()
  const { agent } = await ctx.agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd(), agentPreset: presetId },
    agentOptions: { provider: selection.provider, model: selection.model },
    // The gateway's own shape: the setup callback is where an agent joins its
    // preset, and this roster is the fabricated subtree's, not the main one.
    setup: async (agentCtx: Context) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
      await presets.mount(agentCtx, presetId)
    },
  })
  await agent.whenIdle()
  const before = server.requests.length
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const request = server.requests[before] as { body?: { tools?: { function?: { name?: string } }[] } } | undefined
  const tools = (request?.body?.tools ?? []).map(tool => tool.function?.name ?? '?').sort()
  return tools.join(', ')
}

// --- fabricate both -----------------------------------------------------------

console.log('=== fabricating ===')
const knowledge = await fabricate('recipe.internal-knowledge')
const review = await fabricate('recipe.code-review-agent', resolve(import.meta.dirname, '..', '..'))

console.log(`\ntwo fabricated agents mounted: ${ctx.builder.list().map(a => `${a.spec.name} v${a.spec.version}`).join(', ')}`)

// --- the main picker does not see their personas -------------------------------

const mainPresets = (await ctx.agentPresets.list()).map(preset => preset.id).sort()
console.log(`main roster lists: ${mainPresets.join(', ')}`)
if (mainPresets.some(id => id === 'internal-knowledge' || id === 'code-review-agent')) {
  console.error('!! a fabricated preset leaked into the main picker')
  process.exitCode = 1
}

// --- the knowledge agent ingests, then answers ---------------------------------

console.log('\n=== internal-knowledge converses ===')
const knowledgeRow = [...ctx.loader.entries()]
  .find(entry => entry.id === `${knowledge.spec.name}-v${knowledge.spec.version}.block.knowledge`)
const pipeline = knowledgeRow?.fiber?.ctx.knowledgePipeline
if (pipeline === undefined) throw new Error('no pipeline in the fabricated subtree')
{
  const refused = await pipeline.ingest().then(() => null, (error: unknown) => error)
  const planId = (refused as { planId?: string } | null)?.planId
  if (planId === undefined) throw new Error('the fabricated ingest was not gated')
  ctx.planGate.approve(planId)
  const report = await pipeline.ingest({ planId })
  console.log(`ingested ${report.chunks.written} chunks from ${report.documents.seen} documents`)
}

ctx.on('tools/post-execute', (exec: { name: string }, result: { content?: { type: string, text?: string }[] }, next: () => unknown) => {
  const text = (result.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n')
  console.log(`\n--- ${exec.name} returned ---\n${text.split('\n').slice(0, 6).join('\n')}\n--- end ---`)
  return next()
})

const knowledgeTools = await converse(knowledge.entryId, knowledge.presetId, QUESTION)
console.log(`\ntools the knowledge agent presented: ${knowledgeTools}`)

// --- the review agent reads, and cannot write ----------------------------------

console.log('\n=== code-review converses ===')
const reviewTools = await converse(review.entryId, review.presetId, 'Review CLAUDE.md for contradictions.')
console.log(`tools the review agent presented: ${reviewTools}`)

// The catalogs are the proof of scoping: each agent presents exactly its own
// preset's tools, and neither sees the other's. `write` IS in the review
// agent's catalog -- present and refused is the inspect posture, and its
// persona says so.
if (!knowledgeTools.includes('search_knowledge') || knowledgeTools.includes('read')) {
  console.error('!! the knowledge agent has the wrong catalog')
  process.exitCode = 1
}
if (!reviewTools.includes('read') || !reviewTools.includes('write') || reviewTools.includes('search_knowledge')) {
  console.error('!! the review agent has the wrong catalog')
  process.exitCode = 1
}

// The read-only realm is not a loader row -- preset compositions are standing
// plugin mounts, invisible to the loader and therefore to the graph. What is
// ours to verify is the generated composition (the generator's spec pins the
// realm and its workspaceRoot); the enforcement inside it is upstream's
// fs-sandbox, tested upstream. Said here so the demo does not overclaim.
console.log(`review preset written at: ${review.scaffoldDir}/preset/${review.presetId}/agent.cordis.yml`)

console.log('\n=== dismantle both ===')
await ctx.builder.dismantle(knowledge.entryId)
await ctx.builder.dismantle(review.entryId)
console.log(`remaining fabricated agents: ${ctx.builder.list().length}`)

await server.close()
await tree.stop()
