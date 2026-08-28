/**
 * The on-disk record shapes, and the reader that survives a crash.
 *
 * Split from the exporter so the reader has no Cordis dependency at all: a run
 * picker, a test, or a future history endpoint reads a file without booting a
 * plugin tree.
 *
 * @module @se373/logger-jsonl/format
 */

import type { LoggerType } from '@se373/cordis'

/** Format version of the run-log artifact; bumped when a record shape changes. */
export const RUN_LOG_FORMAT_VERSION = 1

/**
 * The first record of every run log, written at boot.
 *
 * A run picker reads only this line, so listing five runs is five small reads
 * rather than five decompressions.
 */
export interface RunHeaderLine {
  readonly type: 'run'
  readonly version: number
  /** Wall-clock time the run log was opened. */
  readonly startedAt: number
  /** The process that owns this file. */
  readonly pid: number
  /** Working directory the run started in. */
  readonly cwd: string
}

/**
 * The last record of a run log, appended on graceful shutdown.
 *
 * Clean exit cannot be known at boot, so **the absence of this line is how a
 * crashed run is identified** — more useful than a flag that a crashing process
 * never gets to write.
 */
export interface RunFooterLine {
  readonly type: 'run-end'
  /** Wall-clock time the run log was closed. */
  readonly endedAt: number
  /** How many log records the run wrote, for a cheap sanity check against the body. */
  readonly records: number
}

/** One log line, flattened once by the host into something that survives JSON. */
export interface RunLogRecord {
  /** Monotonic sequence number from the logger; gap detection is free. */
  readonly sn: number
  /** Wall-clock time of the log call. */
  readonly ts: number
  /** Package namespace — the filter axis. */
  readonly name: string
  /** Severity category. */
  readonly type: LoggerType
  /** Numeric severity. */
  readonly level: number
  /**
   * The formatted message body, ANSI intact.
   *
   * Stored rather than stripped: the escape codes are the most repetitive bytes
   * in the file so compression erases the size argument, `less -R` and `grep`
   * handle them, and colour you discarded is unrecoverable.
   */
  readonly text: string
  /**
   * Loader entry id of the emitting component. Stable and human-readable, and
   * it **survives a hot reload**, so a line written before a swap still points
   * at the right node.
   */
  readonly entryId?: string
  /**
   * Registry uid of the emitting fiber. Distinguishes two live instances of one
   * entry, and makes "this came from the instance that just died" expressible.
   */
  readonly uid?: number
}

/** Anything that can appear as one line of a run log. */
export type RunLogLine = RunHeaderLine | RunFooterLine | RunLogRecord

/** A run log, read back. */
export interface RunLog {
  /** The header, always present in a readable file. */
  readonly header: RunHeaderLine
  /** Every record that parsed, in file order. */
  readonly records: readonly RunLogRecord[]
  /** The footer, or `undefined` when the run did not shut down gracefully. */
  readonly footer: RunFooterLine | undefined
  /**
   * True when no footer was found. A crash is the ordinary cause; so is a
   * process still running, and a reader cannot tell those apart from the bytes.
   */
  readonly crashed: boolean
  /** How many lines were dropped as unparsable. A crash truncates the last one. */
  readonly skipped: number
}

/** Type guard for the header line. */
function isHeader(value: unknown): value is RunHeaderLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Partial<RunHeaderLine>
  return line.type === 'run'
    && typeof line.version === 'number'
    && typeof line.startedAt === 'number'
    && typeof line.pid === 'number'
    && typeof line.cwd === 'string'
}

/** Type guard for the footer line. */
function isFooter(value: unknown): value is RunFooterLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Partial<RunFooterLine>
  return line.type === 'run-end' && typeof line.endedAt === 'number' && typeof line.records === 'number'
}

/** Type guard for a log record. */
function isRecord(value: unknown): value is RunLogRecord {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Partial<RunLogRecord>
  return typeof line.sn === 'number'
    && typeof line.ts === 'number'
    && typeof line.name === 'string'
    && typeof line.text === 'string'
    && typeof line.type === 'string'
}

/** Serialize one line, newline included. */
export function encodeLine(line: RunLogLine): string {
  return `${JSON.stringify(line)}\n`
}

/**
 * Parse a run log's plaintext.
 *
 * **A trailing malformed record is skipped rather than fatal.** A crash
 * truncates the last line, and the log from the crash under investigation is
 * exactly the one that must still open — a reader that refuses it is useless at
 * the only moment it matters.
 *
 * @param text - the decoded plaintext of the whole file.
 * @returns the parsed run log.
 * @throws when the first line is missing or is not a run header — that is a
 * different failure from a torn tail, and worth saying so.
 */
export function parseRunLog(text: string): RunLog {
  const lines = text.split('\n')
  const first = lines.shift()
  if (first === undefined || first.length === 0) throw new Error('empty or header-less run log')
  let header: unknown
  try {
    header = JSON.parse(first)
  } catch {
    throw new Error('corrupt run log: header line is not valid JSON')
  }
  if (!isHeader(header)) throw new Error('corrupt run log: first line is not a run header')

  const records: RunLogRecord[] = []
  let footer: RunFooterLine | undefined
  let skipped = 0
  for (const line of lines) {
    if (line.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      skipped += 1
      continue
    }
    if (isFooter(parsed)) {
      footer = parsed
      continue
    }
    if (isRecord(parsed)) {
      records.push(parsed)
      continue
    }
    skipped += 1
  }
  return { header, records, footer, crashed: footer === undefined, skipped }
}
