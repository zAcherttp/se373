/**
 * Phase-2 gate: the agent spine answers a task end to end.
 *
 * This boots `examples/chat/cordis.yml` — the config that actually ships, not a
 * row list assembled here — with the DeepSeek adapter pointed at a local mock
 * provider. Everything between the task text and the printed answer is real:
 * the session log, the turn loop, the system prompt, the streaming adapter, and
 * the retry policy.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { startMockLlmServer } from '@se373/llm-mock-server'
import type { MockLlmServer } from '@se373/llm-mock-server'
import { boot } from '../src/boot.ts'
import type { BootedTree } from '../src/boot.ts'
import { useEphemeralHome } from '../../../scripts/ephemeral-home.ts'

// The shipping config persists every session it runs. A spec is not somebody's
// work, so it gets a throwaway home: without this, running the suite leaves
// session logs in the developer's real one, indistinguishable afterwards from
// sessions they might want back.
useEphemeralHome('spine-spec')

const CONFIG = resolve(fileURLToPath(import.meta.url), '../../../..', 'examples/chat/cordis.yml')

/**
 * Collect what the one-shot runner prints.
 *
 * The runner exports an `internals` seam for exactly this, but swapping it here
 * would miss: the Loader imports plugin modules through Node's own resolver,
 * which is a different module graph from the one vitest transforms, so the
 * runner's `internals` is not the object this file would import. `process` is
 * shared across both graphs, and the runner's default sink is `process.stdout`
 * itself, so patching the stream method is what actually intercepts it.
 * @returns the captured chunks and a restore function.
 */
function captureIo(): { out: string[]; err: string[]; restore: () => void } {
  const out: string[] = []
  const err: string[] = []
  const stdout = process.stdout.write.bind(process.stdout)
  const stderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    out.push(String(chunk))
    return (stdout as (...args: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    err.push(String(chunk))
    return (stderr as (...args: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof process.stderr.write
  return {
    out,
    err,
    restore: () => { process.stdout.write = stdout; process.stderr.write = stderr },
  }
}

let server: MockLlmServer | undefined
let tree: BootedTree | undefined
let io: ReturnType<typeof captureIo> | undefined

afterEach(async () => {
  await tree?.stop()
  await server?.close()
  io?.restore()
  tree = undefined
  server = undefined
  io = undefined
  delete process.env.SE373_LLM_BASE_URL
})

/**
 * Boot the shipping config against a mock provider and wait for the run's exit.
 * @param task - the one-shot task text.
 * @param successText - what the mock provider streams back.
 * @returns the exit code the runner requested and what it printed.
 */
async function run(task: string, successText: string): Promise<{ code: number; out: string; err: string }> {
  server = await startMockLlmServer({ sequence: ['success'], repeatLast: true, successText })
  process.env.SE373_LLM_BASE_URL = server.baseURL
  process.env.DEEPSEEK_API_KEY ??= 'mock-key'
  io = captureIo()

  const exited = Promise.withResolvers<number>()
  tree = await boot({
    configFile: CONFIG,
    args: [task],
    onExit: code => { exited.resolve(code) },
    // Quiet: the assertion is on what the runner printed, not on the boot log.
    logLevel: 1,
  })
  const code = await exited.promise
  return { code, out: io.out.join(''), err: io.err.join('') }
}

describe('agent spine', () => {
  it('answers a one-shot task through the real turn loop', async () => {
    const { code, out, err } = await run('say the word', 'spine online')

    expect(err).toBe('')
    expect(out.trim()).toBe('spine online')
    expect(code).toBe(0)
  }, 30_000)

  it('sends the task and the persona to the provider', async () => {
    await run('say the word', 'spine online')

    expect(server!.requests).toHaveLength(1)
    const body = server!.requests[0]!.body as { messages: { role: string; content: unknown }[] }
    expect(body.messages.some(m => m.role === 'system')).toBe(true)
    expect(JSON.stringify(body.messages)).toContain('say the word')
  }, 30_000)
})
