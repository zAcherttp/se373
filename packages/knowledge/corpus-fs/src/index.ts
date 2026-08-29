/**
 * `ctx.corpusSources` over a directory tree — the default provider.
 *
 * Walks a list of roots, keeps files matching a suffix list, and yields one
 * document per file with a source-relative id.
 *
 * Two decisions worth stating, both about what `sourceRef` covers.
 *
 * **Roots are resolved and sorted before they are digested.** The same three
 * directories named in a different order, or named relatively from a different
 * working directory, are the same corpus, and a rebuild that fired because
 * somebody reordered a YAML list would teach people to distrust the mechanism.
 *
 * **The digest covers the selection rules, not the files.** Which files exist
 * is what a *crawl* discovers; `sourceRef` answers the different question of
 * whether the crawl would look in the same places. Hashing the file list would
 * make every edit to every document a stage-0 change, which cascades into a
 * full re-crawl — precisely the thing the positional cascade exists to avoid.
 *
 * @module @se373/corpus-fs
 */

import { Context } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { contentDigest, stageDigest } from '@se373/digest'
import { CorpusSource } from '@se373/corpus'
import type { Document } from '@se373/corpus'

/** Directory names never descended into. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'dist', 'coverage', '.turbo'])

/** Configuration for the filesystem corpus. */
export interface Config {
  /** Directories to walk. Relative paths resolve against the process cwd. */
  readonly roots?: readonly string[]
  /** File extensions to keep, with the leading dot. */
  readonly extensions?: readonly string[]
  /** Files larger than this are skipped, in bytes. */
  readonly maxBytes?: number
}

/**
 * A corpus of files on disk.
 */
export class FilesystemCorpus extends CorpusSource {
  static override readonly name = 'corpus-fs'

  static readonly Config: Schema<Config> = z.object({
    roots: z.array(z.string()).default(['.']),
    extensions: z.array(z.string()).default(['.md', '.txt']),
    maxBytes: z.natural().default(1_000_000),
  }) as Schema<Config>

  /** Absolute, de-duplicated, sorted. */
  private readonly roots: readonly string[]
  private readonly extensions: ReadonlySet<string>
  private readonly maxBytes: number

  readonly sourceRef: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.roots = [...new Set((config.roots ?? ['.']).map(root => resolve(root)))].sort()
    this.extensions = new Set((config.extensions ?? ['.md', '.txt']).map(ext => ext.toLowerCase()))
    this.maxBytes = config.maxBytes ?? 1_000_000
    this.sourceRef = stageDigest(FilesystemCorpus.name, {
      roots: this.roots,
      extensions: [...this.extensions].sort(),
      maxBytes: this.maxBytes,
    })
  }

  /** One line a human reads before approving a rebuild. */
  describe(): string {
    return `${this.roots.length} root(s) [${[...this.extensions].sort().join(' ')}]: ${this.roots.join(', ')}`
  }

  /** Walk one directory, depth first, yielding matching file paths. */
  private async* walk(dir: string): AsyncGenerator<string> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    // Sorted so two crawls of an unchanged tree visit in the same order. Chunk
    // keys do not depend on it, but a reproducible ingest log does, and an
    // ingest you cannot diff is one you cannot debug.
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        yield* this.walk(path)
      } else if (entry.isFile() && this.extensions.has(extname(entry.name).toLowerCase())) {
        yield path
      }
    }
  }

  /**
   * Every matching file under every root.
   *
   * A document's id is its path relative to the root it was found under, with
   * the root's basename in front so two roots cannot collide. Relative, because
   * an absolute path moves with the checkout and would make every document look
   * new on another machine.
   */
  async* documents(): AsyncIterable<Document> {
    for (const root of this.roots) {
      const label = root.split(sep).filter(Boolean).at(-1) ?? 'root'
      for await (const path of this.walk(root)) {
        const info = await stat(path).catch(() => null)
        if (info === null || info.size > this.maxBytes) continue
        const text = await readFile(path, 'utf8').catch(() => null)
        if (text === null || text.trim() === '') continue
        yield {
          id: `${label}/${relative(root, path).split(sep).join('/')}`,
          text,
          title: firstHeading(text),
          contentHash: contentDigest(text),
          metadata: { path: relative(root, path).split(sep).join('/'), root: label, bytes: info.size },
        }
      }
    }
  }
}

/**
 * The document's first Markdown heading, if it opens with one.
 *
 * Only a leading heading counts. A heading found anywhere would pick up the
 * first section of a file whose real title is elsewhere, which is worse than
 * having no title at all — a wrong title travels into every chunk.
 * @param text - the document.
 * @returns the heading text, or `null`.
 */
function firstHeading(text: string): string | null {
  for (const line of text.slice(0, 2000).split('\n')) {
    if (line.trim() === '') continue
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    return match === null ? null : match[1]!
  }
  return null
}

export default FilesystemCorpus
