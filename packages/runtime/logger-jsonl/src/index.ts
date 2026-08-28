/**
 * The app log: every run of the harness leaves a durable record on disk, so
 * "why did last night's boot fail" is answerable in the morning.
 *
 * Upstream has no app log at all. Every dsh package with "log" in its name is
 * session-derived, and the Cordis logger channel lives and dies in the terminal.
 * This is that gap, closed the way Cordis intends: a second registered
 * `Exporter` beside `logger-console`, with **no fork and no modification to
 * anything vendored**, and with its own level threshold — a debug firehose is
 * fine in a terminal and expensive on disk.
 *
 * @module @se373/logger-jsonl
 */

import { Context, Logger, Service } from '@se373/cordis'
import type { Exporter, Formatter, Message } from '@se373/cordis'
// Type-only: contributes `ctx.loader`, whose `locate()` maps a fiber to the row
// that owns it. Reading it opportunistically rather than injecting it keeps the
// sink working on a context with no loader at all.
import type {} from '@se373/cordis-plugin-loader'
import { dshHomePath } from '@se373/home-paths'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { inspect } from 'node:util'
import { RunLogWriter } from './store.ts'
import type { JsonlCompression } from './store.ts'
import type { RunLogRecord } from './format.ts'

export * from './format.ts'
export { listRuns, pruneRuns, readRunLog, runBasename, RunLogWriter } from './store.ts'
export type { RunLogWriterOptions, RunSummary } from './store.ts'

/**
 * Cordis's `LoggerLevel.INFO`. It is a `const enum`, so it has no runtime object
 * to import across a package boundary.
 */
const LEVEL_INFO = 1

/**
 * How long records may sit in memory before they reach the disk.
 *
 * Batching is not an optimization here, it is what makes a compressed run log
 * viable: one Zstandard frame per log line would spend more bytes on frame
 * headers than on text. 200ms is small enough that a `kill -9` loses at most a
 * fifth of a second of narration.
 */
const FLUSH_INTERVAL_MS = 200

declare module '@se373/cordis' {
  interface Context {
    loggerJsonl: JsonlLogExporter
  }
}

const inspectFormatter: Formatter = (value, target) => {
  return inspect(value, { colors: !!target.colors, depth: 4, compact: true, breakLength: Infinity })
}

/** Configuration for the JSONL app-log sink. */
export interface Config {
  /** Directory the run artifacts live in. Defaults to `$SE373_HOME/logs`. */
  readonly dir?: string
  /** How many run logs to keep, including the current one. Must be at least 1. */
  readonly maxRuns?: number
  /** Physical encoding. `'none'` takes the compression path off entirely. */
  readonly compression?: JsonlCompression
  /** Per-package level thresholds, independent of the console exporter's. */
  readonly levels?: Record<string, number>
  /** Longest single rendered line kept; longer lines are elided with `...`. */
  readonly maxLength?: number
}

/**
 * A logger exporter that appends one flat record per message to this run's file.
 *
 * `Message` is not serializable — `args` holds Errors, circular references and
 * sometimes functions, and `fiber` is a `WeakRef` that crosses nothing. So the
 * host formats the display text **once** and keeps everything else structured,
 * which is what lets filtering and node-linking never parse text.
 */
export class JsonlLogExporter extends Service implements Exporter {
  /**
   * The plugin's display name, and therefore the logger namespace its own
   * lines are filed under. Without it the fiber inherits the class name and
   * records read `jsonl-log-exporter`, which is not the package a reader would
   * grep for. `logger-console` shadows `Function.name` the same way.
   */
  static override readonly name = 'logger-jsonl'

  static readonly Config: Schema<Config> = z.object({
    dir: z.string(),
    maxRuns: z.natural().default(5),
    compression: z.union(['zstd', 'none']).default('zstd'),
    levels: z.dict(z.number()),
    maxLength: z.natural().default(10240),
  }) as Schema<Config>

  /**
   * ANSI is **stored, not stripped**. Compression erases the size argument
   * entirely — the escape codes are the most repetitive bytes in the file —
   * standard pagers and grep handle them, and colour you discarded is
   * unrecoverable. 3 matches what `logger-console` emits, so a line read back
   * from disk is byte-identical to the one that was on the terminal.
   */
  readonly colors = 3
  readonly formatters: Record<string, Formatter> = { o: inspectFormatter, O: inspectFormatter }
  readonly levels: Record<string, number>
  readonly maxLength: number

  private readonly dir: string
  private readonly compression: JsonlCompression
  private readonly maxRuns: number

  private pending: RunLogRecord[] = []
  private timer: NodeJS.Timeout | undefined
  private writer: RunLogWriter | undefined
  private stopped = false
  private reportedFailure = false

  constructor(ctx: Context, config: Config = {}) {
    // Published as `ctx.loggerJsonl` so a later consumer -- the phase-4 log
    // view paging past the end of its ring -- can ask where this run's file is
    // without reconstructing the filename convention.
    super(ctx, 'loggerJsonl')
    this.dir = config.dir ?? dshHomePath('logs')
    this.compression = config.compression ?? 'zstd'
    this.maxRuns = config.maxRuns ?? 5
    // Always an object, never absent: Cordis reads `exporter.levels` directly,
    // and an empty map falls through to the logger's own default exactly as an
    // absent one would.
    this.levels = config.levels ?? {}
    this.maxLength = config.maxLength ?? 10240
    if (!Number.isInteger(this.maxRuns) || this.maxRuns < 1) {
      throw new Error(`logger-jsonl: maxRuns must be a positive integer, got ${String(config.maxRuns)}`)
    }
    // Register before the file exists. Records captured now are buffered and
    // land in the file the moment it opens, so the window between mounting this
    // row and creating its artifact loses nothing.
    ctx.logger.exporter(this)
  }

  /** The current run's artifact path, once the file is open. */
  get path(): string | undefined {
    return this.writer?.path
  }

  /** Receive one message. Synchronous by contract; the disk write is not. */
  export(message: Message): void {
    if (this.stopped) return
    this.pending.push(this.toRecord(message))
    this.schedule()
  }

  /**
   * Open the run file, adopt the boot backlog, and arrange for a clean close.
   *
   * Written as an async generator because that is the idiom for lifecycle work
   * that must unwind: the disposer is yielded before anything else can fail, so
   * a later error still closes the handle.
   */
  async* [Service.init](): AsyncGenerator<() => Promise<void>, void, void> {
    yield () => this.stop()
    this.writer = await RunLogWriter.open({
      dir: this.dir,
      compression: this.compression,
      maxRuns: this.maxRuns,
    })
    this.adoptBacklog()
    this.schedule()
    this.ctx.logger.info('run log %C', this.writer.path)
  }

  /**
   * Take everything the process logged before this row mounted.
   *
   * Cordis's `LoggerService` keeps its own ring of recent messages, registered
   * by the root before any config row exists. Draining it here is what makes a
   * boot failure *in a row that mounts before this one* still appear in the
   * file — which is most of what an app log is for.
   *
   * The ring is not a complete record of the boot. It declares no `levels`, so
   * it captures at the logger's own default (INFO): a `debug` line emitted
   * before this row mounted is already gone, whatever this sink's threshold
   * says. Errors and warnings — the ones a post-mortem is looking for — are
   * all above that line.
   */
  private adoptBacklog(): void {
    const captured = new Set(this.pending.map(record => record.sn))
    const backlog = this.ctx.logger.buffer
      .filter(message => !captured.has(message.sn) && this.admits(message))
      .map(message => this.toRecord(message))
    if (backlog.length === 0) return
    this.pending = [...backlog, ...this.pending].sort((a, b) => a.sn - b.sn)
  }

  /**
   * Whether this exporter's own threshold admits a message.
   *
   * Cordis applies `levels` before calling `export()`, so this is needed only
   * for the backlog, which reached the root's ring under the ring's threshold
   * rather than ours.
   */
  private admits(message: Message): boolean {
    const target = this.levels[message.name] ?? this.levels.default ?? LEVEL_INFO
    return target >= message.level
  }

  /** Flatten one message into its durable record. */
  private toRecord(message: Message): RunLogRecord {
    const fiber = message.fiber?.deref()
    // `loader.locate()` is the vendored walk from a fiber up to the row that
    // owns it. Reimplementing it here would be a second copy of a loop the
    // loader already maintains against its own entry model.
    const entryId = fiber === undefined ? undefined : this.ctx.get('loader')?.locate(fiber)
    const uid = fiber?.uid
    return {
      sn: message.sn,
      ts: message.ts,
      name: message.name,
      type: message.type,
      level: message.level,
      text: Logger.format(this, message),
      // Both identities travel, because they answer different questions and
      // both are free: `entryId` survives a hot reload, `uid` distinguishes two
      // live instances of one entry.
      ...entryId === undefined ? {} : { entryId },
      ...uid === undefined || uid === null ? {} : { uid },
    }
  }

  /** Arm the flush timer, unless one is already armed or the file is not open. */
  private schedule(): void {
    if (this.writer === undefined || this.timer !== undefined || this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, FLUSH_INTERVAL_MS)
    this.timer.unref()
  }

  /**
   * Drain the buffer into the file.
   *
   * Never rejects. Both callers are places where a rejection would do damage
   * out of proportion to a failed log write: the flush timer would raise an
   * unhandled rejection, and `stop()` would fail the fiber's disposer and take
   * the tree's unload with it.
   */
  private async flush(): Promise<void> {
    const writer = this.writer
    if (writer === undefined) return
    const batch = this.pending.splice(0)
    try {
      await writer.append(batch)
    } catch (error) {
      this.reportFailure('append', error)
    }
  }

  /**
   * Report a sink failure exactly once per run, on the console.
   *
   * Not through `ctx.logger`: a sink that logs its own failures feeds itself,
   * and the second failure would be reported by the thing that just failed.
   * Once is enough to send someone looking; a per-batch stream of them is noise
   * at exactly the moment the terminal is the only working channel.
   * @param stage - which operation failed, for the operator reading it.
   * @param error - the underlying failure.
   */
  private reportFailure(stage: 'append' | 'close', error: unknown): void {
    if (this.reportedFailure) return
    this.reportedFailure = true
    // oxlint-disable-next-line no-console
    console.error(`logger-jsonl: ${stage} failed; this run's log is incomplete`, error)
  }

  /** Flush, footer, close. Idempotent; the fiber calls it exactly once. */
  private async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    await this.flush()
    try {
      await this.writer?.close()
    } catch (error) {
      this.reportFailure('close', error)
    }
    this.writer = undefined
  }
}

export default JsonlLogExporter
