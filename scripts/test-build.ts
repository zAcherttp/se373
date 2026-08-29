/**
 * The build chain's only test: run it, and check the browser it produces.
 *
 * Four compiler stages plus Vite are load-bearing — a break in any of them is a
 * browser that does not boot — and for four phases nothing checked them but
 * running them. This is the smoke test that closes that: not a unit test of any
 * stage, but the one assertion that matters, made cheaply.
 *
 * It is deliberately NOT part of `pnpm test`. The build takes minutes, and a
 * slow check in the inner loop is a check people learn to skip. The rule it
 * belongs to instead is the tagging rule: a phase is shipped when its tag's
 * demonstrable runs, and this runs before each tag.
 *
 * Usage:  pnpm test:build
 *
 * @module scripts/test-build
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'apps', 'web', 'dist')

/** Fail with a message, loudly. */
function fail(message: string): never {
  console.error(`\ntest:build FAILED — ${message}`)
  process.exit(1)
}

console.log('running the full build (four stages + Vite; this takes minutes)…')
const started = Date.now()
const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
if (build.status !== 0) fail(`the build exited ${build.status}`)
console.log(`build exited 0 in ${Math.round((Date.now() - started) / 1000)}s`)

// The build succeeding is necessary and not sufficient: Vite can exit 0 while
// emitting a shell that references nothing, and tsdown can produce empty client
// bundles that only fail at load. So the output is inspected, minimally.
const indexPath = join(DIST, 'index.html')
if (!existsSync(indexPath)) fail(`no ${indexPath}`)
const html = readFileSync(indexPath, 'utf8')

// A hashed module reference is what distinguishes a built page from the source
// template that happens to be sitting in dist.
const script = /<script[^>]+src="([^"]+\.js)"/.exec(html)
if (script === null) fail('index.html references no script bundle')
const bundlePath = join(DIST, script[1]!.replace(/^\//, ''))
if (!existsSync(bundlePath)) fail(`index.html references ${script[1]} but it is not in dist`)
const bundleBytes = statSync(bundlePath).size
if (bundleBytes < 10_000) fail(`${script[1]} is ${bundleBytes} bytes; that is a stub, not an app`)

// The client-plugin bundles are stage four's output; an empty one loads and
// then mounts nothing, which is the silent variant of a build failure.
const clientBundles = spawnSync('find', ['packages', 'vendor', '-name', 'client.js', '-path', '*/lib/*'], {
  cwd: ROOT,
  encoding: 'utf8',
})
const bundles = clientBundles.stdout.split('\n').filter(line => line !== '')
const empty = bundles.filter(bundle => statSync(join(ROOT, bundle)).size === 0)
if (empty.length > 0) fail(`${empty.length} empty client bundle(s): ${empty.slice(0, 5).join(', ')}`)

console.log(`\ntest:build PASSED — ${script[1]} (${Math.round(bundleBytes / 1024)} kB), ${bundles.length} client bundles, none empty`)
