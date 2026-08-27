/**
 * Boots a Cordis plugin tree from a config file and returns a handle to unload
 * it.
 *
 * Deliberately thin: everything interesting is a config row, not code here. The
 * only real logic is shutdown — unloading the tree and waiting for it to settle,
 * so a leaked registration surfaces as a boot that will not finish rather than
 * as silence (I6).
 *
 * Split from `bin.ts` so a test can boot the same tree the CLI boots. A test
 * that constructs its own row list would be testing a config that ships to
 * nobody.
 *
 * @module @se373/cli/boot
 */

import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@se373/cordis'
import Loader from '@se373/cordis-plugin-loader'
import LoggerConsole from '@se373/cordis-plugin-logger-console'
import { provideCmdline } from '@se373/cmdline'
import { dshHomePath } from '@se373/home-paths'

/** What a caller must decide before a tree can mount. */
export interface BootOptions {
  /** Absolute path to the tree's config file. */
  readonly configFile: string
  /** The tree's own arguments, in argv order; app rows parse these, not us. */
  readonly args: readonly string[]
  /** Called once with the exit code a row requested, after the tree is disposed. */
  readonly onExit: (code: number) => void
  /** Console log level, 3 = info. */
  readonly logLevel?: number
}

/** A mounted tree. */
export interface BootedTree {
  /** The root context the tree mounted under. */
  readonly ctx: Context
  /** Unload the tree and wait for it to settle. Idempotent. */
  stop(): Promise<void>
}

/**
 * Mount a config file as a plugin tree.
 * @param options - the config to boot, the tree's arguments, and the exit sink.
 * @returns the mounted tree.
 */
export async function boot(options: BootOptions): Promise<BootedTree> {
  const ctx = new Context()
  // Plugin names in a config resolve relative to the config, not to the process
  // cwd: a tree declares what it needs, and Node's resolution walks up from
  // there. Booting the same file from anywhere then behaves identically.
  ctx.baseUrl = pathToFileURL(dirname(options.configFile)).href + '/'

  // The console exporter belongs to the PROCESS, not to the tree. Cordis's
  // logger writes only to registered exporters, so a tree-owned exporter is
  // absent before the tree mounts, absent after it unloads, and racy during
  // mount because a group starts its rows concurrently -- a plugin logging from
  // its init can beat the exporter's activation and vanish. Mounting it on the
  // root covers the whole tree lifetime, disposal included.
  await ctx.plugin(LoggerConsole, { levels: { default: options.logLevel ?? 3 } })

  await ctx.plugin(Loader)

  let stopping: Promise<void> | undefined

  /** Unload the tree once, and let every caller await the same unload. */
  const stop = (): Promise<void> => {
    stopping ??= ctx.loader.remove(entryId).then(() => { ctx.logger.info('unloaded') })
    return stopping
  }

  // Launcher facts, not config: the tree's arguments and its exit request must
  // be on the host context before any entry mounts, because a row's lazily
  // resolved config may already read a service that parses them.
  provideCmdline(ctx, {
    args: options.args,
    exit: code => { void stop().then(() => { options.onExit(code) }) },
  })

  // The user-data root accessor that `!!js dshHomePath('sessions')` config rows
  // call. The KEY keeps upstream's name on purpose: it is what dsh's own patch
  // YAML says, so a row transplants verbatim. The VALUE is ours -- home-paths is
  // locally modified to resolve ~/.se373, never a co-installed dsh's home
  // (docs/PORTING.md §1, local modification 6).
  ctx.provide('dshHomePath', dshHomePath)

  // `create` returns the entry id, not a fiber; unloading goes back through the
  // loader by that id.
  const entryId = await ctx.loader.create({
    name: '@se373/cordis-plugin-include',
    config: { path: options.configFile },
  })

  return { ctx, stop }
}
