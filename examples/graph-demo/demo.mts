/**
 * The phase-3.5 demonstrable: the agent inspects the runtime it is running in.
 *
 * This boots `examples/chat/cordis.yml` — the tree that actually ships, not a
 * row list assembled here — against the local mock provider, so the whole path
 * is real except the model: the tool registry, the schema validation, the guard
 * pipeline, the canonical output, the renderer, and the session log. What the
 * mock supplies is only the decision to call `graph_inspect`, which is the one
 * thing an API key would otherwise be buying.
 *
 * Run:  node --import tsx/esm examples/graph-demo/demo.mts
 */

import { resolve } from 'node:path'
import { startMockLlmServer } from '@se373/llm-mock-server'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

// This is a demo, not somebody's work: it gets its own throwaway home so the
// session it writes does not accumulate in the user's real one.
useEphemeralHome('graph-demo')

// A one-shot run has nobody to ask, so `ask` would hang on the first tool call.
process.env.SE373_PERMISSION_MODE = 'danger-full-access'
process.env.DEEPSEEK_API_KEY ??= 'mock-key'

const server = await startMockLlmServer({
  sequence: ['tool_call_success', 'success'],
  repeatLast: true,
  toolName: 'graph_inspect',
  // Disabled rows are the interesting ones: they are the components you would
  // turn on, and a projection that filtered them out would look healthy.
  toolArguments: JSON.stringify({ enabled: false }),
  successText: 'That is the component that is configured but not running.',
})
process.env.SE373_LLM_BASE_URL = server.baseURL

const exited = Promise.withResolvers<number>()
const tree = await boot({
  configFile: resolve(import.meta.dirname, '..', 'chat', 'cordis.yml'),
  args: ['which components are configured but not running?'],
  onExit: code => { exited.resolve(code) },
  logLevel: 2,
})

// The runner prints only the model's final text, so listen in on the tool leg
// -- what the agent actually got back is the thing worth seeing.
tree.ctx.on('tools/post-execute', (exec: any, result: any, next: any) => {
  console.log(`\n--- ${exec.name} returned ---`)
  for (const part of result.content ?? []) {
    if (part.type === 'text') console.log(part.text)
  }
  console.log('--- end ---\n')
  return next()
})

const logPath = tree.ctx.loggerJsonl.path
const code = await exited.promise
console.log(`\nrun log for this boot: ${logPath ?? '(none)'}`)
await server.close()
process.exit(code)
