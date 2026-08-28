/**
 * Delete session logs from `$SE373_HOME`, and leave the workspace registry
 * agreeing with what is left.
 *
 * Automated runs no longer land here — `scripts/ephemeral-home.ts` gives them
 * their own throwaway home — so what this is for is the other case: sessions a
 * *person* created while trying something out, which look exactly like work
 * afterwards. That is why nothing prunes them automatically and why this
 * refuses to delete without being told twice.
 *
 * Removing a session directory is only half the job. The workspace store keeps
 * its own `sessionIds` list, and an id with no log behind it is a ghost row in
 * the sidebar, so the registry is repaired to match the disk.
 *
 * Usage:
 *   node --import tsx/esm scripts/clean-sessions.ts                 # list, delete nothing
 *   node --import tsx/esm scripts/clean-sessions.ts --older-than 7  # only those older than 7 days
 *   node --import tsx/esm scripts/clean-sessions.ts --yes           # actually delete
 *
 * @module scripts/clean-sessions
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHomePath, dshHomeDisplay, resolveDshHome } from '@se373/home-paths'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const argv = process.argv.slice(2)
const confirmed = argv.includes('--yes')
const olderThanIndex = argv.indexOf('--older-than')
const olderThanDays = olderThanIndex === -1 ? undefined : Number(argv[olderThanIndex + 1])
if (olderThanDays !== undefined && !Number.isFinite(olderThanDays)) {
  throw new Error('--older-than takes a number of days')
}

/** One session directory on disk, with the workspace it belongs to. */
interface Session {
  readonly workspace: string
  readonly id: string
  readonly path: string
  readonly modified: number
}

/** Every session log under the sessions root, newest last. */
function collect(root: string): Session[] {
  if (!existsSync(root)) return []
  const sessions: Session[] = []
  for (const workspace of readdirSync(root)) {
    const dir = join(root, workspace)
    if (!statSync(dir).isDirectory()) continue
    for (const id of readdirSync(dir)) {
      const path = join(dir, id)
      const stat = statSync(path)
      if (!stat.isDirectory()) continue
      sessions.push({ workspace, id, path, modified: stat.mtimeMs })
    }
  }
  return sessions.sort((left, right) => left.modified - right.modified)
}

/**
 * Drop ids the disk no longer has from the workspace store.
 *
 * Reached only after `--yes`: the dry run exits before this. Written back only
 * when something actually changed, so a run that finds nothing to repair leaves
 * the file's mtime alone.
 * @param surviving - session ids still present on disk.
 * @returns how many ids were dropped across both lists.
 */
function repairRegistry(surviving: ReadonlySet<string>): number {
  const path = dshHomePath('storages', 'workspace.json')
  if (!existsSync(path)) return 0
  const store = JSON.parse(readFileSync(path, 'utf8')) as {
    global?: { archivedSessionIds?: string[] }
    tables?: { workspaces?: Record<string, { sessionIds?: string[] }> }
  }
  let dropped = 0
  const keep = (ids: string[] | undefined): string[] => {
    const kept = (ids ?? []).filter(id => surviving.has(id))
    dropped += (ids ?? []).length - kept.length
    return kept
  }
  if (store.global !== undefined) store.global.archivedSessionIds = keep(store.global.archivedSessionIds)
  for (const workspace of Object.values(store.tables?.workspaces ?? {})) {
    workspace.sessionIds = keep(workspace.sessionIds)
  }
  if (dropped > 0) writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`)
  return dropped
}

const root = dshHomePath('sessions')
const cutoff = olderThanDays === undefined ? undefined : Date.now() - olderThanDays * MS_PER_DAY
const all = collect(root)
const doomed = cutoff === undefined ? all : all.filter(session => session.modified < cutoff)

console.log(`home: ${dshHomeDisplay(resolveDshHome())} (${root})`)
console.log(`${all.length} session${all.length === 1 ? '' : 's'} on disk, ${doomed.length} selected`)
for (const session of doomed) {
  console.log(`  ${new Date(session.modified).toISOString().slice(0, 16)}  ${session.workspace}/${session.id}`)
}

if (!confirmed) {
  console.log('\nnothing deleted. Re-run with --yes to delete the sessions listed above.')
  process.exit(0)
}

for (const session of doomed) rmSync(session.path, { recursive: true, force: true })
const surviving = new Set(collect(root).map(session => session.id))
const dropped = repairRegistry(surviving)
console.log(`\ndeleted ${doomed.length}; dropped ${dropped} stale id${dropped === 1 ? '' : 's'} from the workspace registry`)
