/**
 * Phase 6b's end condition: an agent answers from the knowledge plane.
 *
 * The whole path is real except the model. The corpus is this repository's
 * `docs/`, the chunks and vectors are the ones the pipeline actually wrote, the
 * tool is registered through `ctx.tools` and validated against its schema, and
 * the passages the model receives are the passages retrieval returned. What the
 * mock provider supplies is only the *decision* to call `search_knowledge` —
 * which is the one thing an API key would otherwise be buying.
 *
 * Two boots, because a one-shot runner starts its turn as soon as the tree is
 * up: the first builds the index, the second answers with it. They share this
 * process's ephemeral home, so the second finds what the first wrote.
 *
 * Requires the default model:  pnpm models:acquire
 * Run:  node --import tsx/esm examples/knowledge-demo/agent.mts
 */

import { resolve } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import { MODELS_ROOT_ENV } from '@se373/model-registry'
import { startMockLlmServer } from '@se373/llm-mock-server'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

const modelsRoot = dshHomePath('models')
useEphemeralHome('knowledge-agent')
process.env[MODELS_ROOT_ENV] ??= modelsRoot

const QUESTION = 'What decides whether a stage is a seam or a waterfall event?'

// --- boot one: build the index ------------------------------------------------

console.log('=== building the index ===')
const builder = await boot({
  configFile: resolve(import.meta.dirname, 'demo.yml'),
  args: [],
  onExit: () => {},
  logLevel: 2,
})
const report = await builder.ctx.knowledgePipeline.ingest()
console.log(`${report.chunks.written} chunks from ${report.documents.seen} documents in ${report.durationMs} ms`)
console.log(`generation ${report.generationId}, key ${report.genKey.slice(0, 12)}…`)
await builder.stop()

// --- boot two: the agent answers ----------------------------------------------

process.env.SE373_PERMISSION_MODE = 'danger-full-access'
process.env.DEEPSEEK_API_KEY ??= 'mock-key'

const server = await startMockLlmServer({
  sequence: ['tool_call_success', 'success'],
  repeatLast: true,
  toolName: 'search_knowledge',
  toolArguments: JSON.stringify({ query: QUESTION, k: 3 }),
  successText: 'Cardinality decides it: exactly one at a time is a seam, several stacking is a waterfall event.',
})
process.env.SE373_LLM_BASE_URL = server.baseURL

console.log(`\n=== the agent answers ===\n? ${QUESTION}`)
const exited = Promise.withResolvers<number>()
const agent = await boot({
  configFile: resolve(import.meta.dirname, 'agent.yml'),
  args: [QUESTION],
  onExit: code => { exited.resolve(code) },
  logLevel: 2,
})

// The runner prints only the model's final text; what the tool actually
// returned is the thing worth seeing, because that is the part that was real.
agent.ctx.on('tools/post-execute', (exec: any, result: any, next: any) => {
  console.log(`\n--- ${exec.name} returned ---`)
  for (const part of result.content ?? []) {
    if (part.type === 'text') console.log(part.text)
  }
  console.log('--- end ---\n')
  return next()
})

const code = await exited.promise
await server.close()
process.exitCode = code
