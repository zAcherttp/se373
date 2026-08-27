#!/usr/bin/env node
/**
 * Process entry point: pick a config, boot it, and translate signals and the
 * tree's exit request into a process exit.
 *
 * Everything else lives in `boot.ts`, which tests use directly.
 *
 * @module @se373/cli
 */

import { resolve } from 'node:path'
import { boot } from './boot.ts'

const DEFAULT_CONFIG = 'examples/hello/cordis.yml'

/**
 * Split argv into the launcher's own config selection and the tree's arguments.
 *
 * The launcher owns `--config <path>` and the leading positional, and nothing
 * else: everything after goes to the tree verbatim. An app row parses its own
 * flags and owns its own `--help`, so adding a flag never touches this file.
 * @param argv - process arguments after the script name.
 * @returns the config path and the tree's inner arguments, in argv order.
 */
function splitArgv(argv: readonly string[]): { path: string; inner: readonly string[] } {
  const flag = argv.indexOf('--config')
  if (flag !== -1) {
    const value = argv[flag + 1]
    if (value === undefined) throw new Error('se373: --config requires a path')
    return { path: value, inner: [...argv.slice(0, flag), ...argv.slice(flag + 2)] }
  }
  const [first, ...rest] = argv
  return first === undefined ? { path: DEFAULT_CONFIG, inner: [] } : { path: first, inner: rest }
}

const { path, inner } = splitArgv(process.argv.slice(2))

const tree = await boot({
  configFile: resolve(process.cwd(), path),
  args: inner,
  onExit: code => { process.exit(code) },
})

tree.ctx.logger.info('booted %s', path)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    tree.ctx.logger.info('unloading on %s', signal)
    void tree.stop().then(() => { process.exit(0) })
  })
}
