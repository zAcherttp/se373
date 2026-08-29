/**
 * `ctx.blocks` — a **repository**, not a catalog.
 *
 * The distinction is the whole design. A catalog is read-only and populated at
 * mount from whatever was vendored; a repository has a write path, versions,
 * parentage, and a namespace for entries that did not come from the vendor. The
 * deciding argument is provenance: the moment a block carries `origin`, entries
 * can come from somewhere other than the vendor, and a catalog cannot express
 * that. Retrofitting a write path into a catalog is a rewrite of the registry;
 * starting with a repository that happens to be full of system-authored entries
 * costs almost nothing.
 *
 * **One registry, keyed by `kind`.** Keeping it single is what makes "compare
 * two retrieval pipelines" and "compare two agents" differ only in which blocks
 * the rows name — the comparison machinery gets written once.
 *
 * **Forks are new ids in a separate namespace, never in-place edits.** The
 * original is untouched by construction rather than by policy, which is also why
 * you can still compare against it: you cannot compare against a version you
 * mutated away.
 *
 * @module @se373/block-registry
 */

import { Context, Service } from '@se373/cordis'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dshHomePath } from '@se373/home-paths'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { contributeNode } from '@se373/runtime-graph'
import type { Block, BlockKind, BlockOrigin, BlockQuery, MountVerdict } from './types.ts'

export * from './types.ts'

declare module '@se373/cordis' {
  interface Context {
    blocks: BlockRepository
  }

  interface Events {
    /**
     * A block version was written.
     * @param block - the new version.
     * @mode emit
     */
    'blocks/registered'(block: Block): void
  }
}

/** What a caller supplies to register a version. */
export interface BlockInput extends Omit<Block, 'version' | 'createdAt'> {
  readonly version?: never
  readonly createdAt?: never
}

/** Configuration for the block repository. */
export interface Config {
  /**
   * Where non-system blocks are persisted.
   *
   * Defaults to `$SE373_HOME/blocks/repository.json`. System blocks are never
   * written: they are re-registered by their own rows at every boot, so
   * persisting them would create a second, staler source for something the
   * config already decides.
   */
  readonly file?: string
}

/**
 * The block repository.
 */
export class BlockRepository extends Service {
  static override readonly name = 'block-registry'

  static readonly Config: Schema<Config> = z.object({
    file: z.string(),
  }) as Schema<Config>

  /** id → every version, oldest first. */
  private readonly history = new Map<string, Block[]>()
  /** `id@version` of blocks whose conformance suite has passed. Persisted. */
  private readonly certified = new Set<string>()
  private readonly file: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'blocks')
    this.file = config.file ?? dshHomePath('blocks', 'repository.json')
    this.load()
    contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Block repository' })
  }

  /** Read persisted non-system blocks, tolerating absence and corruption. */
  private load(): void {
    if (!existsSync(this.file)) return
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as
        Block[] | { blocks: Block[], certified?: string[] }
      const blocks = Array.isArray(stored) ? stored : stored.blocks
      for (const ref of Array.isArray(stored) ? [] : stored.certified ?? []) this.certified.add(ref)
      for (const block of blocks) {
        const versions = this.history.get(block.id) ?? []
        versions.push(block)
        this.history.set(block.id, versions)
      }
    } catch {
      // A corrupt repository means "no authored blocks", not a crash: every
      // system block is re-registered from its own row, so the harness still
      // boots with a complete cookbook and only forks are missing.
      this.history.clear()
    }
  }

  /** Persist everything that did not come from a row. */
  private save(): void {
    const durable = [...this.history.values()].flat().filter(block => block.origin !== 'system')
    if (durable.length === 0 && this.certified.size === 0 && !existsSync(this.file)) return
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(
      this.file,
      `${JSON.stringify({ blocks: durable, certified: [...this.certified].sort() }, null, 2)}\n`,
    )
  }

  /**
   * Write a block version.
   *
   * Registering an id that already exists appends a version rather than
   * replacing one — that is what makes the repository a repository, and what
   * lets a comparison name `id@version` and still find it later.
   * @param input - the block, without its version or timestamp.
   * @returns the written version.
   */
  register(input: BlockInput): Block {
    const versions = this.history.get(input.id) ?? []
    const block: Block = {
      ...input,
      version: (versions.at(-1)?.version ?? 0) + 1,
      createdAt: Date.now(),
    }
    versions.push(block)
    this.history.set(block.id, versions)
    if (block.origin !== 'system') this.save()
    this.ctx.emit('blocks/registered', block)
    return block
  }

  /**
   * The newest version of a block.
   * @param id - the block id.
   * @returns the block, or `undefined`.
   */
  get(id: string): Block | undefined {
    return this.history.get(id)?.at(-1)
  }

  /**
   * One specific version.
   * @param id - the block id.
   * @param version - the version number, from 1.
   * @returns the block, or `undefined`.
   */
  at(id: string, version: number): Block | undefined {
    return this.history.get(id)?.find(block => block.version === version)
  }

  /**
   * Every version of a block, oldest first.
   * @param id - the block id.
   * @returns the history, empty when unknown.
   */
  versions(id: string): Block[] {
    return [...this.history.get(id) ?? []]
  }

  /**
   * The newest version of every block, narrowed.
   * @param query - optional filters; an omitted field filters nothing.
   * @returns matching blocks.
   */
  list(query: BlockQuery = {}): Block[] {
    const out: Block[] = []
    for (const versions of this.history.values()) {
      const block = versions.at(-1)
      if (block === undefined) continue
      if (query.kind !== undefined && block.kind !== query.kind) continue
      if (query.origin !== undefined && block.origin !== query.origin) continue
      if (query.seam !== undefined && block.manifest.seam !== query.seam) continue
      if (query.tier !== undefined && block.manifest.tier !== query.tier) continue
      out.push(block)
    }
    return out.sort((left, right) => (left.id < right.id ? -1 : 1))
  }

  /**
   * Derive a new block from an existing one.
   *
   * The fork gets its own id in a separate namespace and records its parent as
   * `id@version`. It never shadows the original, which therefore survives by
   * construction — the property that makes a failed evolution recoverable and a
   * v1-vs-v2 comparison possible at all.
   * @param id - the block to derive from.
   * @param changes - manifest fields to override, and the new origin.
   * @returns the forked block.
   * @throws when the source id is unknown.
   */
  fork(
    id: string,
    changes: { readonly origin: BlockOrigin, readonly id?: string, readonly manifest?: Partial<Block['manifest']> },
  ): Block {
    const source = this.get(id)
    if (source === undefined) throw new Error(`no block ${JSON.stringify(id)} to fork`)
    const forkId = changes.id ?? `${id}.fork-${this.nextForkOrdinal(id)}`
    if (forkId === id) throw new Error(`a fork may not reuse the id ${JSON.stringify(id)}`)
    return this.register({
      id: forkId,
      kind: source.kind,
      origin: changes.origin,
      forkedFrom: `${source.id}@${source.version}`,
      ...source.conformance === undefined ? {} : { conformance: source.conformance },
      manifest: { ...source.manifest, ...changes.manifest },
    })
  }

  /** The next unused `.fork-N` ordinal for an id. */
  private nextForkOrdinal(id: string): number {
    let ordinal = 1
    while (this.history.has(`${id}.fork-${ordinal}`)) ordinal += 1
    return ordinal
  }

  /**
   * Whether policy lets a block mount now.
   *
   * The one place `origin` does work rather than decorate. An agent-authored
   * block is not distrusted because of who wrote it in the abstract — it is
   * distrusted until the suite its seam ships says otherwise, which is I7.
   * @param id - the block id.
   * @returns the verdict and the rule behind it.
   */
  mountable(id: string): MountVerdict {
    const block = this.get(id)
    if (block === undefined) return { allowed: false, reason: `no block ${id}` }
    if (block.origin !== 'agent') {
      return { allowed: true, reason: `${block.origin}-authored blocks mount directly` }
    }
    if (block.conformance === undefined) {
      return {
        allowed: false,
        reason: `${id} is agent-authored and names no conformance suite; nothing could vouch for it`,
      }
    }
    if (this.certified.has(blockRef(block))) {
      return {
        allowed: true,
        reason: `${id} is agent-authored and passed the ${block.conformance} suite (I7)`,
      }
    }
    return {
      allowed: false,
      reason: `${id} is agent-authored and must pass the ${block.conformance} suite before mounting`,
    }
  }

  /**
   * Record that a block's newest version passed its conformance suite.
   *
   * Certification is **per version**, because it vouches for bytes: a later
   * `register` of the same id is new code the suite has not seen, and it starts
   * uncertified. Only the authoring pipeline calls this, after the suite it
   * names actually ran — certifying is the one write that turns `origin:
   * 'agent'` from a refusal into a mount, so it must never be reachable as a
   * side effect of anything else.
   * @param id - the block id; its newest version is what gets certified.
   * @returns the certified block.
   * @throws when the block is unknown or names no conformance suite.
   */
  certify(id: string): Block {
    const block = this.get(id)
    if (block === undefined) throw new Error(`no block ${JSON.stringify(id)} to certify`)
    if (block.conformance === undefined) {
      throw new Error(`${id} names no conformance suite; there is nothing a certification could mean`)
    }
    this.certified.add(blockRef(block))
    this.save()
    return block
  }

  /**
   * Withdraw a certification.
   *
   * The staging gate calls this when a certified fork's bytes change and the
   * new bytes fail their suite: the registry must stop vouching for a version
   * whose on-disk source no longer matches what passed. The block and its
   * versions survive — decertifying is not deletion — but `mountable` refuses
   * again until something re-passes.
   * @param id - the block id; every version's certification is withdrawn.
   */
  decertify(id: string): void {
    for (const block of this.versions(id)) this.certified.delete(blockRef(block))
    this.save()
  }

  /** Where non-system blocks are persisted. */
  get path(): string {
    return this.file
  }
}

export default BlockRepository

/** Join a block id and version the way `forkedFrom` records it. */
export function blockRef(block: Pick<Block, 'id' | 'version'>): string {
  return `${block.id}@${block.version}`
}

/** Split a `id@version` reference. */
export function parseBlockRef(ref: string): { id: string, version: number } | null {
  const at = ref.lastIndexOf('@')
  if (at <= 0) return null
  const version = Number(ref.slice(at + 1))
  if (!Number.isInteger(version) || version < 1) return null
  return { id: ref.slice(0, at), version }
}

/** Every kind a caller may pass, re-exported for tools that enumerate them. */
export type { BlockKind as Kind }
