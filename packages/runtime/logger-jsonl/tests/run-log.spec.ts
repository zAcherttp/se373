/**
 * The app log's two load-bearing promises: a failed write must not silence the
 * ones after it, and a truncated file must still read.
 *
 * Both are chosen because they fail *quietly*. A poisoned write queue produces
 * a file that looks like a crash; a mis-parsed tail produces a file that looks
 * empty. Neither throws where anyone would see it.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeLine, parseRunLog } from '../src/format.ts'
import type { RunLogRecord } from '../src/format.ts'
import { readRunLog, RunLogWriter } from '../src/store.ts'

const dirs: string[] = []

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A throwaway log directory, removed after the test. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'se373-run-log-'))
  dirs.push(dir)
  return dir
}

/** One record, distinguishable by its sequence number. */
function record(sn: number): RunLogRecord {
  return { sn, ts: 1_700_000_000_000 + sn, name: 'spec', type: 'info', level: 2, text: `line ${String(sn)}` }
}

describe('RunLogWriter', () => {
  it('writes a readable run and marks it clean', async () => {
    const dir = await scratch()
    const writer = await RunLogWriter.open({ dir, compression: 'none', maxRuns: 5 })
    await writer.append([record(1), record(2)])
    await writer.append([record(3)])
    await writer.close()

    const log = await readRunLog(writer.path)
    expect(log.records.map(entry => entry.sn)).toEqual([1, 2, 3])
    expect(log.crashed).toBe(false)
    expect(log.footer?.records).toBe(3)
    expect(log.skipped).toBe(0)
  })

  it('keeps writing after a failed append, and still writes its footer', async () => {
    // White-box on purpose: the failure this guards against is a *disk* error,
    // and the only honest way to produce one on demand is to stand in for the
    // handle. What is being tested is the sequencer, not the filesystem.
    const dir = await scratch()
    const writer = await RunLogWriter.open({ dir, compression: 'none', maxRuns: 5 })

    const attempted: string[] = []
    let failNext = true
    const stub = {
      writeFile: (data: string | Buffer): Promise<void> => {
        const text = data.toString()
        if (failNext) {
          failNext = false
          attempted.push('FAILED')
          return Promise.reject(new Error('ENOSPC'))
        }
        attempted.push(text)
        return Promise.resolve()
      },
      sync: (): Promise<void> => Promise.resolve(),
      close: (): Promise<void> => Promise.resolve(),
    }
    ;(writer as unknown as { handle: unknown }).handle = stub

    // The caller learns about its own failure...
    await expect(writer.append([record(1)])).rejects.toThrow('ENOSPC')
    // ...and everything queued behind it still runs.
    await writer.append([record(2)])
    await writer.close()

    expect(attempted[0]).toBe('FAILED')
    expect(attempted[1]).toContain('"sn":2')
    expect(attempted.at(-1)).toContain('"type":"run-end"')
  })
})

describe('parseRunLog', () => {
  it('recovers a run killed mid-record', async () => {
    const dir = await scratch()
    const writer = await RunLogWriter.open({ dir, compression: 'none', maxRuns: 5 })
    await writer.append([record(1), record(2), record(3)])
    await writer.close()

    // Truncate inside the last record, the way a kill during a write leaves it.
    const whole = await readFile(writer.path, 'utf8')
    const lastRecordStart = whole.lastIndexOf(encodeLine(record(3)))
    await writeFile(writer.path, whole.slice(0, lastRecordStart + 20))

    const log = await readRunLog(writer.path)
    expect(log.records.map(entry => entry.sn)).toEqual([1, 2])
    expect(log.skipped).toBe(1)
    // No footer survived the truncation, which is exactly how a crash is told
    // apart from a clean exit.
    expect(log.crashed).toBe(true)
  })

  it('refuses a file whose header is not a header', () => {
    // A header-less file is unreadable rather than empty: reporting zero
    // records for a corrupt file would hide the corruption behind a plausible
    // answer.
    expect(() => parseRunLog('')).toThrow(/header/)
    expect(() => parseRunLog('not json\n')).toThrow(/header/)
    expect(() => parseRunLog(`${JSON.stringify({ type: 'nope' })}\n`)).toThrow(/header/)
  })
})
