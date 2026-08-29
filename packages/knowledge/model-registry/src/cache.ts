/**
 * Where model bytes live, and how we decide we have them.
 *
 * The cache mirrors the repository's own paths under
 * `$SE373_HOME/models/<repo>/<revision>/`. Two reasons, both load-bearing:
 * ONNX external-data sidecars are referenced *by relative filename from inside
 * the graph*, so flattening or renaming would break loading in a way that only
 * shows up at inference; and keying by revision means two pinned revisions of
 * the same repo coexist, which is what lets an old index keep serving while a
 * new one builds.
 *
 * **Presence is size-checked, not hashed.** Hashing 300 MB on every boot would
 * make the cheapest question in the system the slowest, so `resolve` compares
 * byte length against the row's pinned size — which catches the realistic
 * failure, a truncated or interrupted transfer — and full verification is a
 * separate deliberate call. There is no "verified" marker file anywhere: a
 * marker would be a declared flag about freshness, which is exactly the thing
 * this project refuses to trust.
 *
 * @module @se373/model-registry/cache
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MissingModel, ModelResolution, ModelRow, ResolvedModel } from './types.ts'

/**
 * The directory a row's files live in.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns an absolute directory path.
 */
export function modelDir(root: string, row: ModelRow): string {
  // The repo id contains one `/`, which becomes a real directory level. Split
  // explicitly rather than interpolating, so a repo id that somehow carried a
  // path segment could not escape the root.
  const segments = row.repo.split('/').filter(segment => segment !== '' && segment !== '.' && segment !== '..')
  return join(root, ...segments, row.revision)
}

/** Absolute paths for each named slot. */
function slotPaths(dir: string, row: ModelRow): ResolvedModel['paths'] {
  return {
    onnx: join(dir, row.files.onnx),
    onnxData: row.files.onnxData === undefined ? undefined : join(dir, row.files.onnxData),
    tokenizer: join(dir, row.files.tokenizer),
    tokenizerConfig: join(dir, row.files.tokenizerConfig),
  } as ResolvedModel['paths']
}

/**
 * Total transfer size of a row.
 * @param row - the declared model.
 * @returns bytes.
 */
export function rowBytes(row: ModelRow): number {
  return row.artifacts.reduce((total, artifact) => total + artifact.bytes, 0)
}

/**
 * Decide whether a row's bytes are on disk.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns a resolution naming every absent file when incomplete.
 */
export async function resolveRow(root: string, row: ModelRow): Promise<ModelResolution> {
  const dir = modelDir(root, row)
  const missing: string[] = []
  let outstanding = 0
  for (const artifact of row.artifacts) {
    const path = join(dir, artifact.file)
    // A wrong size is treated as absent rather than as corrupt, because the
    // remedy is identical -- fetch it again -- and a caller offered two failure
    // modes with one fix will eventually handle only one of them.
    const size = await stat(path).then(info => info.size, () => -1)
    if (size !== artifact.bytes) {
      missing.push(artifact.file)
      outstanding += artifact.bytes
    }
  }
  if (missing.length === 0) {
    return { status: 'ready', row, dir, paths: slotPaths(dir, row) }
  }
  const megabytes = Math.ceil(outstanding / 1_000_000)
  return {
    status: 'missing',
    row,
    dir,
    missing,
    bytes: outstanding,
    remedy:
      `model ${row.id} needs ${missing.length} file(s), ${megabytes} MB, from ${row.repo}@${row.revision.slice(0, 7)} `
      + `(licence: ${row.license}). Run: pnpm models:acquire ${row.id}`,
  } satisfies MissingModel
}

/** SHA-256 of a file, streamed. */
async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/**
 * Re-hash every file of a row against its pinned digest.
 *
 * The expensive check `resolve` deliberately skips. Called after acquisition,
 * and by hand when a model is suspected of being wrong.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns repository-relative paths whose contents did not match; empty is a pass.
 */
export async function verifyRow(root: string, row: ModelRow): Promise<string[]> {
  const dir = modelDir(root, row)
  const bad: string[] = []
  for (const artifact of row.artifacts) {
    const actual = await digest(join(dir, artifact.file)).catch(() => null)
    if (actual !== artifact.sha256) bad.push(artifact.file)
  }
  return bad
}
