#!/usr/bin/env node
/**
 * Boots a Cordis plugin tree from a config file and holds it open.
 *
 * Deliberately thin: everything interesting is a config row, not code here.
 * The only real logic is shutdown — unloading the tree and waiting for it to
 * settle, so a leaked registration surfaces as a process that will not exit
 * rather than as silence (I6).
 *
 * @module @se373/cli
 */

import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@se373/cordis'
import Loader from '@se373/cordis-plugin-loader'
import LoggerConsole from '@se373/cordis-plugin-logger-console'

const DEFAULT_CONFIG = 'examples/hello/cordis.yml'

/** Read the config path from argv, falling back to the phase-1 example. */
function configPath(argv: readonly string[]): string {
  const flag = argv.indexOf('--config')
  if (flag !== -1) {
    const value = argv[flag + 1]
    if (value === undefined) throw new Error('se373: --config requires a path')
    return value
  }
  return argv[0] ?? DEFAULT_CONFIG
}

const path = configPath(process.argv.slice(2))

const configFile = resolve(process.cwd(), path)

const ctx = new Context()
// Plugin names in a config resolve relative to the config, not to the process
// cwd: a tree declares what it needs, and Node's resolution walks up from
// there. Booting the same file from anywhere then behaves identically.
ctx.baseUrl = pathToFileURL(dirname(configFile)).href + '/'

// The console exporter belongs to the PROCESS, not to the tree. Cordis's
// logger writes only to registered exporters, so a tree-owned exporter is
// absent before the tree mounts, absent after it unloads, and racy during
// mount because a group starts its rows concurrently -- a plugin logging from
// its init can beat the exporter's activation and vanish. Mounting it on the
// root covers the whole process lifetime, disposal included.
await ctx.plugin(LoggerConsole, { levels: { default: 3 } })

await ctx.plugin(Loader)

// `create` returns the entry id, not a fiber; unloading goes back through the
// loader by that id.
const entryId = await ctx.loader.create({
  name: '@se373/cordis-plugin-include',
  config: { path: configFile },
})

ctx.logger.info('booted %s', path)

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    ctx.logger.info('unloading on %s', signal)
    // Awaiting the unload is the point: if a row leaked a handle, the process
    // hangs here instead of exiting cleanly and pretending nothing is wrong.
    void ctx.loader.remove(entryId).then(() => {
      ctx.logger.info('unloaded')
      process.exit(0)
    })
  })
}
