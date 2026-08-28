/**
 * `clean-sessions` deletes irreversibly, so the property that matters is not
 * "does it delete" but "does it delete only what it said it would" — and the
 * dangerous direction is the registry repair, which could drop ids whose
 * sessions are still on disk and leave a sidebar missing live rows.
 *
 * Black-box on the shipped script, against a fabricated home. Anything else
 * would test a refactoring of it rather than the thing that runs.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const SCRIPT = resolve(fileURLToPath(import.meta.url), '../../..', 'scripts/clean-sessions.ts')
const homes: string[] = []

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})

/**
 * A home with two sessions on disk and a registry listing three — the third a
 * ghost, which is the state a hand-deleted session leaves behind.
 * @param agedDays - how old to make `session-old`.
 * @returns the home path.
 */
async function fabricate(agedDays: number): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'se373-clean-'))
  homes.push(home)
  for (const id of ['session-old', 'session-new']) {
    await mkdir(join(home, 'sessions', '--ws--', id), { recursive: true })
    await writeFile(join(home, 'sessions', '--ws--', id, 'session.jsonl'), '{}\n')
  }
  const aged = new Date(Date.now() - agedDays * 24 * 60 * 60 * 1000)
  utimesSync(join(home, 'sessions', '--ws--', 'session-old'), aged, aged)
  await mkdir(join(home, 'storages'), { recursive: true })
  await writeFile(join(home, 'storages', 'workspace.json'), `${JSON.stringify({
    global: { archivedSessionIds: ['session-old', 'session-ghost'] },
    tables: { workspaces: { w1: { sessionIds: ['session-old', 'session-new', 'session-ghost'] } } },
  })}\n`)
  return home
}

/** Run the script against one home. */
async function clean(home: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('node', ['--import', 'tsx/esm', SCRIPT, ...args], {
    env: { ...process.env, SE373_HOME: home },
  })
  return stdout
}

/** The registry's surviving ids, workspace list first. */
async function registry(home: string): Promise<{ sessions: string[]; archived: string[] }> {
  const store = JSON.parse(await readFile(join(home, 'storages', 'workspace.json'), 'utf8')) as {
    global: { archivedSessionIds: string[] }
    tables: { workspaces: Record<string, { sessionIds: string[] }> }
  }
  return {
    sessions: store.tables.workspaces['w1']?.sessionIds ?? [],
    archived: store.global.archivedSessionIds,
  }
}

describe('clean-sessions', () => {
  it('deletes nothing without --yes, however it is narrowed', async () => {
    // A destructive tool whose default is destruction is a tool nobody can
    // safely explore. The dry run must name what it would take and take none.
    const home = await fabricate(30)
    const output = await clean(home)
    expect(output).toContain('nothing deleted')
    expect(output).toContain('session-old')
    expect(existsSync(join(home, 'sessions', '--ws--', 'session-old'))).toBe(true)
    expect((await registry(home)).sessions).toHaveLength(3)
  })

  it('honours --older-than rather than taking the whole directory', async () => {
    const home = await fabricate(30)
    await clean(home, '--older-than', '7', '--yes')
    expect(existsSync(join(home, 'sessions', '--ws--', 'session-old'))).toBe(false)
    expect(existsSync(join(home, 'sessions', '--ws--', 'session-new'))).toBe(true)
  })

  it('drops registry ids with no session left, and keeps every id that has one', async () => {
    // Both directions matter and they fail differently: keeping a dead id
    // leaves a ghost row in the sidebar, and dropping a live one hides a
    // session the user still has.
    const home = await fabricate(30)
    await clean(home, '--older-than', '7', '--yes')
    const after = await registry(home)
    expect(after.sessions).toEqual(['session-new'])
    expect(after.archived).toEqual([])
  })

  it('leaves the registry alone on a dry run, ghosts included', async () => {
    // The fabricated registry already contains a ghost id, so a dry run that
    // "just tidied that up while it was there" would be visible here. Nothing
    // about a listing should write.
    const home = await fabricate(30)
    const before = await readFile(join(home, 'storages', 'workspace.json'), 'utf8')
    await clean(home, '--older-than', '7')
    expect(await readFile(join(home, 'storages', 'workspace.json'), 'utf8')).toBe(before)
  })
})
