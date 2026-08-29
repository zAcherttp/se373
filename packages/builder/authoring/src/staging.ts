/**
 * The staging gate: editing a certified fork re-earns the mount before the
 * running tree sees the new bytes.
 *
 * Upstream's HMR reloads a row the moment its file changes, which is exactly
 * right for trusted code and exactly wrong for model-authored code — a fork
 * whose edit broke its contract would hot-swap the breakage straight into a
 * live agent. So the gate owns reload-on-edit for forks instead of wrapping raw
 * HMR: a change is **staged**, the pipeline's checking stages re-run against
 * the new bytes, and only a pass refreshes the rows that name the fork. A
 * failure decertifies — the registry stops vouching for source that no longer
 * matches what passed — and the live rows keep the previous bytes, loudly.
 *
 * The refresh works by renaming the row to `index.ts?sha=<digest>`: module
 * caches (Node's and the loader's alike) key by URL, so the digest in the name
 * is what makes "reload" actually mean the new bytes. It is the same honesty
 * the conformance import needed, applied to the mount.
 *
 * @module @se373/authoring/staging
 */

import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@se373/cordis'
import type {} from '@se373/cordis-plugin-loader'
import { contributeNode } from '@se373/runtime-graph'
import type { StagingVerdict } from './index.ts'

export const name = 'authoring-staging'
export const inject = ['authoring', 'blocks', 'loader']

/** Debounce window: editors write several times per save. */
const SETTLE_MS = 150

/**
 * Register the gate.
 * @param ctx - the plugin context; `authoring`, `blocks` and `loader` are injected.
 */
export function apply(ctx: Context): void {
  contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Fork staging gate' })

  const watchers = new Map<string, FSWatcher>()
  const timers = new Map<string, NodeJS.Timeout>()

  const stage = async (forkName: string): Promise<void> => {
    const verdict = await ctx.authoring.recheck(forkName)
    if (verdict.status === 'rejected') {
      ctx.blocks.decertify(forkName)
      ctx.logger.error(
        'staging: %s changed and the new bytes FAIL %s at %s — decertified; live rows keep the previous bytes.\n%s',
        forkName, verdict.suite, verdict.stage, verdict.output,
      )
      ctx.emit('authoring/staged', { forkName, verdict })
      return
    }
    // The pass refreshes every row naming this fork, by renaming it to the new
    // bytes' digest. Row identity (the id) is untouched; only what it imports
    // moves, which is I3's own gesture.
    const dir = join(ctx.authoring.path, forkName)
    const entry = pathToFileURL(join(dir, 'index.ts')).href
    let refreshed = 0
    for (const row of ctx.loader.entries()) {
      const rowName = String(row.options.name)
      if (!rowName.startsWith(entry) && !rowName.startsWith(join(dir, 'index.ts'))) continue
      await row.update({ ...row.options, name: `${join(dir, 'index.ts')}?sha=${verdict.sha}` })
      refreshed += 1
    }
    ctx.logger.info('staging: %s re-passed its suite; %d row(s) refreshed to sha %s', forkName, refreshed, verdict.sha)
    ctx.emit('authoring/staged', { forkName, verdict, refreshed })
  }

  const watchFork = (forkName: string): void => {
    if (watchers.has(forkName)) return
    const dir = join(ctx.authoring.path, forkName)
    let watcher: FSWatcher
    try {
      watcher = watch(dir, { recursive: true }, () => {
        clearTimeout(timers.get(forkName))
        timers.set(forkName, setTimeout(() => { void stage(forkName) }, SETTLE_MS))
      })
    } catch {
      // A certified block whose directory is gone is the crash-leftover case;
      // nothing to watch, and recheck would report it if asked.
      return
    }
    watchers.set(forkName, watcher)
  }

  // Watch what is already certified, and everything certified from now on.
  for (const block of ctx.blocks.list({ origin: 'agent' })) {
    if (ctx.blocks.mountable(block.id).allowed) watchFork(block.id)
  }
  ctx.on('authoring/finished', (report) => {
    if (report.status === 'certified' && report.block !== undefined) watchFork(report.block.id)
  })

  ctx.fiber.effect(() => () => {
    for (const timer of timers.values()) clearTimeout(timer)
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
  }, 'authoring-staging watchers')
}

/** Read a fork's current bytes, for recheck digests. */
export function forkSources(root: string, forkName: string): Record<string, string> {
  return { 'index.ts': readFileSync(join(root, forkName, 'index.ts'), 'utf8') }
}

export default { name, inject, apply }

declare module '@se373/cordis' {
  interface Events {
    /**
     * A staged edit was judged.
     * @param event - the fork, the verdict, and how many rows refreshed on a pass.
     * @mode emit
     */
    'authoring/staged'(event: { forkName: string, verdict: StagingVerdict, refreshed?: number }): void
  }
}
