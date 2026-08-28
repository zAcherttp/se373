/**
 * Runtime invariant companion for `@se373/logger-jsonl`.
 *
 * @module @se373/logger-jsonl/invariant
 */

import { access } from 'node:fs/promises'
import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'
import type {} from './index.ts'

/**
 * The live artifact must still be on disk.
 *
 * Retention pruning deletes files in the same directory this run is writing to,
 * and it runs while sibling harness processes may be writing their own. A
 * pruning bug that took the current run's file would leave a sink that reports
 * success into a deleted inode — visible only when someone went looking for the
 * log and found nothing. This is the check that names that failure at the time
 * it happens.
 */
const check: InvariantInstaller = Object.assign(
  async (ctx: Context, fail: (message: string) => never) => {
    const path = ctx.loggerJsonl.path
    // Before the file opens there is nothing to have lost.
    if (path === undefined) return
    try {
      await access(path)
    } catch {
      fail(`the run log this process is appending to is gone from disk: ${path}`)
    }
  },
  { inject: ['loggerJsonl'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/logger-jsonl', check)
  })
}
