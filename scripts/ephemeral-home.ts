/**
 * A throwaway `$SE373_HOME` for runs that are not somebody's actual work.
 *
 * The harness keeps every session, and deliberately so — sessions are the
 * user's record, and nothing upstream prunes them. That is the right policy for
 * a person and the wrong one for a test: two days of automated runs left 69
 * session logs in a real user's home, indistinguishable after the fact from
 * work they might want back.
 *
 * So the fix is not retention, which would eventually delete something real.
 * It is that an automated run should never write there at all. Every demo and
 * spec calls this first; the directory goes away when the process does.
 *
 * @module scripts/ephemeral-home
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The signals a runner is expected to survive by cleaning up rather than leaking. */
const INTERRUPTS = ['SIGINT', 'SIGTERM'] as const

/**
 * Point `$SE373_HOME` at a fresh temporary directory for this process.
 *
 * Set before anything reads it: `home-paths` resolves the variable on every
 * call rather than caching, so this only has to run before the first row
 * mounts, but running it at the top of the file is the habit that survives
 * refactoring.
 * @param label - short name for the run, so a leaked directory is attributable.
 * @returns the absolute home this process will use.
 */
export function useEphemeralHome(label: string): string {
  const home = mkdtempSync(join(tmpdir(), `se373-${label}-`))
  process.env.SE373_HOME = home

  const remove = (): void => { rmSync(home, { recursive: true, force: true }) }
  // `exit` covers the ordinary end and an explicit `process.exit`, and is the
  // only place a synchronous remove is safe. The signal handlers exist because
  // `exit` does not fire on an un-handled SIGINT, and they re-raise so the
  // caller's own handlers and the shell both still see the signal.
  process.once('exit', remove)
  for (const signal of INTERRUPTS) {
    process.once(signal, () => {
      remove()
      process.kill(process.pid, signal)
    })
  }
  return home
}
