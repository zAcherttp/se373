/**
 * Declare-then-acquire, from the command line.
 *
 * Weights are never fetched as a side effect of using the harness — that is the
 * point of `@se373/model-registry`, and it is why this script exists as a
 * separate deliberate act. Everything here runs against the library directly
 * rather than booting a plugin tree: a download that needed a Cordis context to
 * happen would be a download that cannot happen when the context will not boot,
 * which is exactly the situation a missing model creates.
 *
 * Usage:
 *   node --import tsx/esm scripts/models.ts list
 *   node --import tsx/esm scripts/models.ts acquire [<model-id>]
 *   node --import tsx/esm scripts/models.ts verify  [<model-id>]
 *
 * @module scripts/models
 */

import { dshHomeDisplay, dshHomePath, resolveDshHome } from '@se373/home-paths'
import {
  acquireRow,
  BUILTIN_MODELS,
  DEFAULT_MODEL_ID,
  resolveRow,
  rowBytes,
  verifyRow,
} from '@se373/model-registry'
import type { ModelRow } from '@se373/model-registry'

const ROOT = dshHomePath('models')
const [command = 'list', wanted] = process.argv.slice(2)

/** Megabytes, rounded up, for human consumption. */
function mb(bytes: number): string {
  return `${Math.ceil(bytes / 1_000_000)} MB`
}

/** Look up a row by id, or fail naming what exists. */
function pick(id: string = DEFAULT_MODEL_ID): ModelRow {
  const row = BUILTIN_MODELS.find(candidate => candidate.id === id)
  if (row === undefined) {
    console.error(`unknown model ${JSON.stringify(id)}`)
    console.error(`declared: ${BUILTIN_MODELS.map(candidate => candidate.id).join(', ')}`)
    process.exit(1)
  }
  return row
}

console.log(`home: ${dshHomeDisplay(resolveDshHome())}`)
console.log(`models: ${ROOT}\n`)

if (command === 'list') {
  for (const row of BUILTIN_MODELS) {
    const state = await resolveRow(ROOT, row)
    const mark = state.status === 'ready' ? '✓' : '·'
    const suffix = row.id === DEFAULT_MODEL_ID ? '  (default)' : ''
    console.log(`${mark} ${row.id}${suffix}`)
    console.log(`    ${row.summary}`)
    console.log(`    widths [${row.mrlDims.join(', ')}]  ${mb(rowBytes(row))}  licence ${row.license}`)
    if (state.status === 'missing') console.log(`    missing ${state.missing.length} file(s), ${mb(state.bytes)}`)
    console.log()
  }
  console.log('acquire with:  pnpm models:acquire <id>')
} else if (command === 'acquire') {
  const row = pick(wanted)
  const before = await resolveRow(ROOT, row)
  if (before.status === 'ready') {
    console.log(`${row.id} is already present at ${before.dir}`)
    process.exit(0)
  }
  console.log(`${row.id} — ${row.summary}`)
  console.log(`source  ${row.repo}@${row.revision.slice(0, 7)}`)
  console.log(`licence ${row.license}`)
  console.log(`fetching ${before.missing.length} file(s), ${mb(before.bytes)} into ${before.dir}\n`)

  let lastLine = ''
  await acquireRow(ROOT, row, before.missing, {
    onProgress: ({ file, received, total, index, count }) => {
      const percent = total === 0 ? 100 : Math.floor((received / total) * 100)
      const line = `  [${index}/${count}] ${file} ${String(percent).padStart(3)}%`
      // Repaint only on change: a 300 MB file emits thousands of chunks and
      // repainting each one costs more than the download.
      if (line === lastLine) return
      lastLine = line
      process.stdout.write(`\r${line.padEnd(72)}`)
    },
  })
  process.stdout.write('\n\n')
  const after = await resolveRow(ROOT, row)
  console.log(after.status === 'ready' ? `${row.id} is ready` : `${row.id} is still incomplete`)
} else if (command === 'verify') {
  const row = pick(wanted)
  console.log(`re-hashing ${row.artifacts.length} file(s) of ${row.id}…`)
  const bad = await verifyRow(ROOT, row)
  if (bad.length === 0) {
    console.log('every file matches its pinned digest')
  } else {
    console.error(`digest mismatch: ${bad.join(', ')}`)
    console.error('re-acquire with:  pnpm models:acquire ' + row.id)
    process.exit(1)
  }
} else {
  console.error(`unknown command ${JSON.stringify(command)}; expected list, acquire or verify`)
  process.exit(1)
}
