/**
 * File mechanics for the run log: durable creation, serialized appends,
 * retention pruning, and reading a file back.
 *
 * The durability primitives are **reused, not reimplemented**. `logSuffix`,
 * the Zstandard frame helpers, and the Windows durable-namespace publication
 * come from the vendored `session-persistence-jsonl` through its declared
 * `./src/*` export. `win32.ts` in particular is the `koffi` →
 * `MoveFileExW(MOVEFILE_WRITE_THROUGH)` work, and rediscovering that would be
 * the most expensive avoidable mistake in this package. The deep imports are
 * recorded in `docs/PORTING.md`, because a sync could move those files.
 *
 * @module @se373/logger-jsonl/store
 */

import { open, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { FileHandle } from 'node:fs/promises'
import { logSuffix } from '@se373/session-persistence-jsonl/src/format.ts'
import type { JsonlCompression } from '@se373/session-persistence-jsonl/src/format.ts'
import {
  compressZstdFrame,
  decompressZstdFrame,
  decompressZstdPrefix,
  scanZstdFrames,
} from '@se373/session-persistence-jsonl/src/zstd.ts'
import {
  ensureDurableDirectoryWin32,
  publishNewFileWin32,
} from '@se373/session-persistence-jsonl/src/win32.ts'
import { encodeLine, parseRunLog, RUN_LOG_FORMAT_VERSION } from './format.ts'
import type { RunFooterLine, RunHeaderLine, RunLog, RunLogRecord } from './format.ts'

export type { JsonlCompression }

/**
 * Name one run's artifact.
 *
 * Sorts by name (a fixed-width UTC stamp) and cannot collide between concurrent
 * processes (the pid). Harness subprocesses coexist with the main process, so
 * collision-freedom is a requirement rather than a nicety.
 * @param startedAt - the run's start time.
 * @param pid - the owning process id.
 * @param disambiguator - appended only when the plain name is already taken.
 * @returns the file basename, without a suffix.
 */
export function runBasename(startedAt: number, pid: number, disambiguator?: string): string {
  const stamp = new Date(startedAt).toISOString().replace(/[-:.]/g, '')
  const suffix = disambiguator === undefined ? '' : `-${disambiguator}`
  return `${stamp}-${pid}${suffix}`
}

/** Every run-log artifact in a directory, newest first by name. */
async function listArtifacts(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return names
    .filter(name => name.endsWith('.jsonl') || name.endsWith('.jsonl.zstd'))
    .sort()
    .reverse()
}

/**
 * Delete all but the newest `keep` artifacts.
 *
 * **Pruning is a startup-only act, and it is best-effort.** Harness
 * subprocesses coexist with the main process, so pruning can race a live
 * writer: unlinking an open file is harmless on POSIX and fails on Windows. A
 * locked file is therefore skipped and retried next boot — never a boot failure,
 * because losing the ability to start over a stale log file would be an absurd
 * trade.
 *
 * @param dir - the run-log directory.
 * @param keep - how many of the newest artifacts to leave alone; never negative.
 * @returns the artifacts that were removed, and the ones that were skipped.
 */
export async function pruneRuns(dir: string, keep: number): Promise<{ removed: string[]; skipped: string[] }> {
  const artifacts = await listArtifacts(dir)
  const removed: string[] = []
  const skipped: string[] = []
  for (const name of artifacts.slice(Math.max(0, keep))) {
    try {
      await rm(join(dir, name))
      removed.push(name)
    } catch (error) {
      // Every failure is a skip, deliberately, and the reason is not worth
      // branching on: `EPERM`/`EBUSY` is a live sibling holding the file on
      // Windows, and anything else is a directory we do not fully control. A
      // stale log file is never worth failing a boot over, so the retry is
      // simply the next startup.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      skipped.push(name)
    }
  }
  return { removed, skipped }
}

/** fsync a POSIX directory so a just-created entry is crash-durable. */
async function syncDirPosix(dir: string): Promise<void> {
  const handle = await open(dir, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Write a temp file beside the target, fsync it, and return its path. */
async function writeSyncedTempFile(finalPath: string, content: Buffer | string): Promise<string> {
  const tmp = `${finalPath}.${randomBytes(6).toString('hex')}.tmp`
  const handle = await open(tmp, 'wx', 0o600)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle.close()
  }
  return tmp
}

/**
 * Create a new file at `path` with `content`, durably, without ever replacing an
 * existing one.
 *
 * POSIX gets `O_EXCL` plus an fsync; Windows has no parent-directory fsync
 * contract through Node, so it stages the file and publishes it through the
 * native durable-namespace primitive instead.
 * @param path - the artifact path; must not already exist.
 * @param content - the header bytes.
 * @throws `EEXIST` when the path is taken, which the caller retries under a new name.
 */
async function publish(path: string, content: Buffer | string): Promise<void> {
  if (process.platform === 'win32') {
    const tmp = await writeSyncedTempFile(path, content)
    try {
      await publishNewFileWin32(tmp, path)
    } catch (error) {
      await rm(tmp, { force: true })
      throw error
    }
    return
  }
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(content)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Options a writer needs before it can create its file. */
export interface RunLogWriterOptions {
  /** Directory the run artifacts live in; created if absent. */
  readonly dir: string
  /** Physical encoding, and therefore the filename suffix. */
  readonly compression: JsonlCompression
  /** How many run logs to keep, including the one about to be created. */
  readonly maxRuns: number
}

/**
 * One run's append-only log file.
 *
 * Appends are serialized through a single promise chain: the exporter's
 * `export()` is synchronous and may fire faster than the disk, and two
 * overlapping appends to one handle would interleave bytes.
 */
export class RunLogWriter {
  /** The artifact's absolute path. */
  readonly path: string
  /** The header written at boot. */
  readonly header: RunHeaderLine

  private handle: FileHandle | undefined
  private tail: Promise<void> = Promise.resolve()
  private written = 0
  private closed = false

  private constructor(path: string, header: RunHeaderLine, handle: FileHandle, private compression: JsonlCompression) {
    this.path = path
    this.header = header
    this.handle = handle
  }

  /** Encode one batch of JSONL text in the configured physical representation. */
  private encode(text: string): Promise<Buffer> | string {
    return this.compression === 'zstd' ? compressZstdFrame(text) : text
  }

  /**
   * Queue one write behind every write already queued.
   *
   * The sequencer must survive a failed write. Chaining `tail = tail.then(...)`
   * directly would leave `tail` permanently rejected after one transient error:
   * every later append would be skipped in silence, and so would the footer —
   * so a perfectly clean shutdown would read back as a crash. The returned
   * promise still rejects, so the caller learns; only the chain is protected.
   * @param work - the write to perform once the queue drains.
   * @returns the caller's view of this write, which may reject.
   */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const done = this.tail.then(work)
    this.tail = done.catch(() => {})
    return done
  }

  /**
   * Prune old runs, then create and publish this run's file with its header.
   *
   * The header goes down durably before any record does, so a run that dies one
   * millisecond later still leaves a file a picker can list.
   * @param options - directory, encoding, and retention.
   * @returns an open writer.
   */
  static async open(options: RunLogWriterOptions): Promise<RunLogWriter> {
    const startedAt = Date.now()
    const header: RunHeaderLine = {
      type: 'run',
      version: RUN_LOG_FORMAT_VERSION,
      startedAt,
      pid: process.pid,
      cwd: process.cwd(),
    }
    const headerText = encodeLine(header)
    const content: Buffer | string = options.compression === 'zstd'
      ? await compressZstdFrame(headerText)
      : headerText

    if (process.platform === 'win32') {
      await ensureDurableDirectoryWin32(options.dir)
    } else {
      await mkdir(options.dir, { recursive: true, mode: 0o700 })
      await syncDirPosix(dirname(options.dir))
    }
    // Prune before publishing, so retention counts this run within its budget.
    await pruneRuns(options.dir, Math.max(0, options.maxRuns - 1))

    // A stamp plus a pid is collision-free across concurrent processes, which is
    // the case the naming exists for. It is NOT collision-free against the same
    // process restarting inside one millisecond -- a test harness does that, and
    // there the sink must degrade to a second file, never to a failed row.
    let path = ''
    for (let attempt = 0; ; attempt++) {
      path = join(
        options.dir,
        runBasename(startedAt, process.pid, attempt === 0 ? undefined : randomBytes(2).toString('hex'))
          + logSuffix(options.compression),
      )
      try {
        await publish(path, content)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt >= 4) throw error
      }
    }
    if (process.platform !== 'win32') await syncDirPosix(options.dir)

    return new RunLogWriter(path, header, await open(path, 'a'), options.compression)
  }

  /** How many records this writer has appended. */
  get records(): number {
    return this.written
  }

  /**
   * Append a batch of records.
   *
   * Batching is what makes a Zstandard run log viable at all: one frame per log
   * line would spend more bytes on frame headers than on text.
   * @param records - the batch, in sequence order; an empty batch is a no-op.
   * @returns a promise settling once the bytes reached the file.
   */
  append(records: readonly RunLogRecord[]): Promise<void> {
    if (records.length === 0 || this.closed) return this.tail
    this.written += records.length
    const text = records.map(encodeLine).join('')
    return this.enqueue(async () => {
      const handle = this.handle
      if (handle === undefined) return
      await handle.writeFile(await this.encode(text))
    })
  }

  /**
   * Append the footer and close.
   *
   * The footer is the *only* signal of a clean exit, so it is fsynced: a footer
   * lost in the page cache would misreport a healthy shutdown as a crash.
   * @returns a promise settling once the file is closed. Idempotent.
   */
  async close(): Promise<void> {
    if (this.closed) return this.tail
    this.closed = true
    const footer: RunFooterLine = { type: 'run-end', endedAt: Date.now(), records: this.written }
    const text = encodeLine(footer)
    return this.enqueue(async () => {
      const handle = this.handle
      if (handle === undefined) return
      this.handle = undefined
      try {
        await handle.writeFile(await this.encode(text))
        await handle.sync()
      } finally {
        await handle.close()
      }
    })
  }
}

/**
 * Decode an artifact to plaintext.
 *
 * A torn final Zstandard frame is decoded with `ZSTD_e_flush`, which recovers
 * whatever plaintext the interrupted frame did contain instead of discarding the
 * whole batch. The line-level reader then drops the partial last line.
 * @param path - the artifact path.
 * @returns the file's plaintext.
 */
async function decodeArtifact(path: string): Promise<string> {
  const buffer = await readFile(path)
  if (!path.endsWith('.zstd')) return buffer.toString('utf8')
  const { frames, tornStart } = scanZstdFrames(buffer)
  const parts: Buffer[] = []
  for (const frame of frames) {
    parts.push(await decompressZstdFrame(buffer.subarray(frame.start, frame.end)))
  }
  if (tornStart !== undefined) {
    try {
      parts.push(await decompressZstdPrefix(buffer.subarray(tornStart)))
    } catch {
      // A frame torn before its header completed yields nothing decodable.
      // Losing the final batch is the honest outcome; refusing the file is not.
    }
  }
  return Buffer.concat(parts).toString('utf8')
}

/**
 * Read one run log back.
 * @param path - the artifact path.
 * @returns the header, records, footer, and whether the run ended cleanly.
 */
export async function readRunLog(path: string): Promise<RunLog> {
  return parseRunLog(await decodeArtifact(path))
}

/** One run, as a picker sees it without reading its body. */
export interface RunSummary {
  /** Absolute path to the artifact. */
  readonly path: string
  /** The run header. */
  readonly header: RunHeaderLine
  /** Artifact size in bytes. */
  readonly bytes: number
}

/**
 * List the runs in a directory, newest first.
 *
 * Plaintext artifacts are read header-line-only; a compressed artifact needs its
 * first frame, which is the header alone because the header is written as its
 * own frame. Either way this is a small read per run rather than a full
 * decompression, which is the whole reason the header is a separate line.
 * @param dir - the run-log directory.
 * @returns one summary per readable artifact; unreadable ones are omitted.
 */
export async function listRuns(dir: string): Promise<RunSummary[]> {
  const summaries: RunSummary[] = []
  for (const name of await listArtifacts(dir)) {
    const path = join(dir, name)
    try {
      const { size } = await stat(path)
      const header = await readHeaderOnly(path)
      if (header !== undefined) summaries.push({ path, header, bytes: size })
    } catch {
      // A run being written by a live sibling, or a file someone else's tool
      // dropped here. Skipping it is more useful than failing the listing.
    }
  }
  return summaries
}

/** Read just the header line of an artifact. */
async function readHeaderOnly(path: string): Promise<RunHeaderLine | undefined> {
  if (!path.endsWith('.zstd')) {
    const handle = await open(path, 'r')
    try {
      // 4 KiB comfortably spans a header line; a longer cwd simply falls back to
      // the full read below.
      const chunk = Buffer.alloc(4096)
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, 0)
      const text = chunk.subarray(0, bytesRead).toString('utf8')
      const newline = text.indexOf('\n')
      if (newline === -1) return undefined
      return parseRunLog(text.slice(0, newline + 1)).header
    } finally {
      await handle.close()
    }
  }
  const buffer = await readFile(path)
  const { frames } = scanZstdFrames(buffer, 1)
  const first = frames[0]
  if (first === undefined) return undefined
  const plain = (await decompressZstdFrame(buffer.subarray(first.start, first.end))).toString('utf8')
  return parseRunLog(plain).header
}
