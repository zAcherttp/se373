/**
 * Fetching model bytes, once, on purpose.
 *
 * Two properties this has to have.
 *
 * **A partial download must never resolve as ready.** Each file streams to a
 * `.partial` sibling, is hashed as it is written, and is renamed into place only
 * after its digest matches. An interrupted transfer therefore leaves debris that
 * `resolve` correctly reports as missing, rather than a plausible-looking file
 * that fails at inference much later.
 *
 * **The digest is checked against the pin, not against the server.** Hugging
 * Face's `x-linked-etag` carries a SHA-256 we could compare to, but comparing a
 * download to a header the same response supplied verifies only that the
 * transfer was intact. The row's pinned digest is what makes the fingerprint a
 * statement about bytes.
 *
 * @module @se373/model-registry/acquire
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { modelDir } from './cache.ts'
import type { AcquireOptions, ModelRow } from './types.ts'

/** Structural minimum of an artifact, so `cache.ts` need not be imported for it. */
export interface ArtifactTarget {
  readonly file: string
  readonly sha256: string
  readonly bytes: number
}

/** Build the resolve URL for one file at a pinned revision. */
function sourceUrl(row: ModelRow, file: string): string {
  return `https://huggingface.co/${row.repo}/resolve/${row.revision}/${file}`
}

/**
 * Download one file, verify it, and move it into place.
 * @param row - the declared model.
 * @param dir - the model's cache directory.
 * @param artifact - the file to fetch.
 * @param report - called with bytes written so far.
 * @param signal - abort signal.
 * @throws Error when the transfer fails or the digest does not match the pin.
 */
async function fetchArtifact(
  row: ModelRow,
  dir: string,
  artifact: ArtifactTarget,
  report: (received: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  const target = join(dir, artifact.file)
  const partial = `${target}.partial`
  await mkdir(dirname(target), { recursive: true })

  const response = await fetch(sourceUrl(row, artifact.file), { signal: signal ?? null, redirect: 'follow' })
  if (!response.ok || response.body === null) {
    throw new Error(`GET ${artifact.file} from ${row.repo}: HTTP ${response.status}`)
  }

  const hash = createHash('sha256')
  let received = 0
  // Hashing inside the pipeline rather than re-reading the file afterwards:
  // one pass over 300 MB instead of two, and no window in which the file exists
  // unverified under its final name.
  const counted = async function* (): AsyncGenerator<Uint8Array> {
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      const bytes = chunk as Uint8Array
      hash.update(bytes)
      received += bytes.byteLength
      report(received)
      yield bytes
    }
  }

  try {
    await pipeline(counted(), createWriteStream(partial))
    const actual = hash.digest('hex')
    if (actual !== artifact.sha256) {
      throw new Error(
        `${artifact.file} hashed to ${actual}, pinned digest is ${artifact.sha256}. `
        + 'The revision moved or the transfer was tampered with; nothing was installed.',
      )
    }
    if (received !== artifact.bytes) {
      throw new Error(`${artifact.file} is ${received} bytes, pinned size is ${artifact.bytes}`)
    }
    await rename(partial, target)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

/**
 * Fetch every file a row declares that is not already present.
 *
 * Not plan-gated here. The gate belongs to whatever *invokes* this — a script a
 * human ran, or, once the builder plane exists, an approved plan — and putting
 * a prompt inside a library function would make it unusable from both.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @param outstanding - repository-relative paths to fetch.
 * @param options - progress and cancellation.
 */
export async function acquireRow(
  root: string,
  row: ModelRow,
  outstanding: readonly string[],
  options: AcquireOptions = {},
): Promise<void> {
  const dir = modelDir(root, row)
  const wanted = row.artifacts.filter(artifact => outstanding.includes(artifact.file))
  for (const [index, artifact] of wanted.entries()) {
    await fetchArtifact(row, dir, artifact, received => {
      options.onProgress?.({
        file: artifact.file,
        received,
        total: artifact.bytes,
        index: index + 1,
        count: wanted.length,
      })
    }, options.signal)
  }
}
