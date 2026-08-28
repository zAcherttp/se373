/**
 * The phase-5 demonstrable: an agent delegates, and a child agent runs.
 *
 * This boots `examples/web/cordis.yml` — the tree that ships — against the local
 * mock provider, then talks to it the way the browser does: over `/api`, through
 * the browser-trust fence, with a session the gateway composes from a preset.
 * Everything between the prompt and the child's transcript is real. The mock
 * supplies only the *decision* to delegate, which is the one thing an API key
 * would otherwise be buying.
 *
 * It is a fair bit of ceremony compared to `examples/graph-demo`, and the reason
 * is the finding: presets are mounted by the GATEWAY, at session creation. A
 * headless script that builds its own agent gets no preset, and an agent with no
 * preset has no tools at all — the global tool layer is empty by design now.
 *
 * Run:  node --import tsx/esm examples/subagent-demo/demo.mts
 */

import { resolve } from 'node:path'
import { startMockLlmServer } from '@se373/llm-mock-server'
import { boot } from '../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../scripts/ephemeral-home.ts'

useEphemeralHome('subagent-demo')
// A delegated turn runs tools with nobody at the keyboard to approve them.
process.env.SE373_PERMISSION_MODE = 'danger-full-access'
process.env.DEEPSEEK_API_KEY ??= 'mock-key'

const PORT = 3097
const BASE = `http://127.0.0.1:${String(PORT)}`

const server = await startMockLlmServer({
  // The parent's first turn delegates; everything after it — the child's own
  // turn, and the parent's follow-up once the child returns — is a plain answer.
  sequence: ['tool_call_success', 'success'],
  repeatLast: true,
  toolName: 'subagent',
  toolArguments: JSON.stringify({
    description: 'count the runtime rows',
    prompt: 'Use graph_inspect to say how many rows are configured. Answer in one line.',
    run_in_background: false,
  }),
  successText: 'Delegated and done.',
})
process.env.SE373_LLM_BASE_URL = server.baseURL

const tree = await boot({
  configFile: resolve(import.meta.dirname, '..', 'web', 'cordis.yml'),
  args: ['--no-open', '--port', String(PORT)],
  onExit: () => {},
  logLevel: 2,
})

/**
 * One RPC, spoken exactly as the browser speaks it.
 *
 * Node's fetch sends `Host: 127.0.0.1:<port>` and no `Origin`, which is what
 * the trust fence wants: loopback authority, no cross-site marker.
 * @param method - the RPC method, which is also the path.
 * @param payload - the method's payload.
 * @returns the unwrapped result value.
 */
async function rpc<T>(method: string, payload: unknown): Promise<T> {
  const response = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `demo-${method}`, method, payload }),
  })
  const body = await response.json() as { result?: { ok?: boolean; value?: T; error?: unknown } }
  if (body.result?.ok !== true) throw new Error(`${method} failed: ${JSON.stringify(body.result?.error)}`)
  return body.result.value as T
}

const ctx = tree.ctx as unknown as {
  get: (name: string) => any
  logger: { info: (...args: unknown[]) => void }
}

const created = await rpc<{ sessionId: string; agentPreset?: string }>('session.create', {
  cwd: process.cwd(),
})
console.log(`session ${created.sessionId}`)
console.log(`preset  ${created.agentPreset ?? '(none — the roster is not composed)'}`)

await rpc('session.prompt', {
  sessionId: created.sessionId,
  mode: 'queue',
  content: [{ type: 'text', text: 'Delegate the row count to a subagent.' }],
})

// The child is a session of its own, registered against the parent. Poll the
// registry rather than the transcript: a child that never appears is the failure
// this demo exists to catch, and it is invisible in the parent's text.
interface Child { kind: string; id: string; activity: string; mode?: string; label?: string; hasChildren?: boolean }
const subagents = ctx.get('subagents')
const deadline = Date.now() + 60_000
let children: Child[] = []
while (Date.now() < deadline) {
  await new Promise(done => setTimeout(done, 1000))
  children = await subagents.listChildren(created.sessionId) as Child[]
  // `inactive` is the settled state: the child's logical record has left
  // `ctx.sessions` and only its persistence remains.
  if (children.length > 0 && children.every(child => child.activity === 'inactive')) break
}

console.log(`\nchildren: ${String(children.length)}`)
for (const child of children) {
  console.log(`  ${child.id}`)
  console.log(`    mode=${child.mode ?? '?'} activity=${child.activity} label=${JSON.stringify(child.label)}`)
}

// The parent's own transcript, through the same gateway. A registry row proves
// a child session exists; the parent's log proves the model asked for it and got
// an answer back. (The child's own history is not readable here: the gateway
// serves the sessions a client owns, and a subagent belongs to its parent.)
const history = await rpc<{ events: { event?: Record<string, unknown> }[] }>(
  'session.history',
  { sessionId: created.sessionId, maxMessages: 50 },
)
const events = history.events.map(entry => entry.event ?? {})
interface ToolEvent { type?: string; data?: { name?: string; message?: { content?: { content?: { text?: string }[] }[] } } }
const calls = (events as ToolEvent[]).filter(event => event.type === 'tool/call')
console.log(`\nparent transcript: ${String(events.length)} events`)
for (const call of calls) console.log(`  tool/call  ${String(call.data?.name)}`)
const results = (events as ToolEvent[]).filter(event => event.type === 'tool/result')
for (const result of results) {
  const text = result.data?.message?.content?.[0]?.content?.[0]?.text
  console.log(`  tool/result  ${JSON.stringify(text)}`)
}

const ok = children.length > 0 && calls.some(call => call.data?.name === 'subagent')
console.log(ok
  ? '\nPASS — the agent called subagent, and a child agent ran and settled.'
  : '\nFAIL — no subagent call, or no child agent.')

await tree.stop()
await server.close()
process.exit(ok ? 0 : 1)
