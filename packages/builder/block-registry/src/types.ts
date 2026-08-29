/**
 * The block record, and the manifest §6.1 describes.
 *
 * @module @se373/block-registry/types
 */

/** What a block is for. One registry, keyed by this. */
export type BlockKind = 'agent' | 'ui' | 'pipeline' | 'recipe'

/** Every kind, for iteration. */
export const BLOCK_KINDS = ['agent', 'ui', 'pipeline', 'recipe'] as const satisfies readonly BlockKind[]

/**
 * Who wrote a block.
 *
 * A **field, not a badge**. The inspector's badge is a projection of it, the
 * same way the graph is a projection of the runtime. What the field does is gate
 * policy: `system` and `user` blocks mount directly, and an `agent` block mounts
 * only after passing its seam's conformance suite (I7).
 */
export type BlockOrigin = 'system' | 'agent' | 'user'

/** Invariant I2's three tiers. */
export type BlockTier =
  /** No configuration at all. */
  | 'ready'
  /** Runs on an embedded local default; configuring it is an upgrade. */
  | 'defaulted'
  /** Genuinely needs a secret. Visibly inert until connected. */
  | 'blocked'

/** What a block declares about itself (§6.1). */
export interface BlockManifest {
  /** One line a human reads in the cookbook. */
  readonly summary: string
  /** The `ctx` key this fills, when it fills one. */
  readonly seam?: string
  /**
   * Service names this publishes.
   *
   * Distinct from {@link seam}, and both are needed. A seam is a *contract with
   * alternatives* — the thing a builder isolates, so two fabrications do not
   * collide in the root realm. `provides` is simply what appears on `ctx`,
   * including core services that have no alternatives and therefore no seam.
   * Defaults to the seam's key when one is declared, so a provider need not say
   * the same thing twice.
   */
  readonly provides?: readonly string[]
  /** Its part in the runtime. */
  readonly role?: 'seam' | 'provider' | 'core' | 'tool' | 'listener'
  /** Which of I2's tiers it lands in. */
  readonly tier: BlockTier
  /**
   * Whether swapping this rebuilds the index.
   *
   * **A UI hint only.** The write-path fingerprint is authoritative (§5.5), and
   * this exists so a plan card can say "about four minutes" before the
   * fingerprint proves it. A block that lies here changes nothing about what
   * actually happens.
   */
  readonly indexInvalidating?: boolean
  /** The module a loader row would name. Absent for blocks that are not rows. */
  readonly plugin?: string
  /**
   * Which plane of a fabricated agent this row belongs to.
   *
   * `subsystem` (the default) mounts in the fabricated subtree — the plane the
   * agent runs on. `agent` mounts in the fabricated *preset composition*, the
   * per-agent scope where tools and personas live: a tool registered there is
   * visible only to sessions joined to that preset, which is what upstream's
   * whole preset mechanism exists to provide. Putting a tool in the subtree
   * instead leaves it `pending` forever — `ctx.tools` is a per-agent affair —
   * which is exactly the warning 6c's plans kept printing.
   */
  readonly mount?: 'subsystem' | 'agent'
  /** Cordis services it injects. */
  readonly inject?: readonly string[]
  /** Credentials or config that must be filled before it leaves `blocked`. */
  readonly requires?: readonly string[]
  /** Config a composed row starts from. */
  readonly defaults?: Readonly<Record<string, unknown>>
}

/** One version of one block. */
export interface Block {
  /** Stable id. Forks get their own; they never shadow an upstream id. */
  readonly id: string
  /** What it is for. */
  readonly kind: BlockKind
  /** Who wrote it. */
  readonly origin: BlockOrigin
  /** Monotonic from 1. Registering an existing id appends a version. */
  readonly version: number
  /** The block this was derived from, as `id@version`. Present iff derived. */
  readonly forkedFrom?: string
  /** The seam whose suite it must pass before mounting. */
  readonly conformance?: string
  /** Its manifest. */
  readonly manifest: BlockManifest
  /** Epoch milliseconds. */
  readonly createdAt: number
}

/** Narrow a listing. An omitted field filters nothing. */
export interface BlockQuery {
  readonly kind?: BlockKind
  readonly origin?: BlockOrigin
  readonly seam?: string
  readonly tier?: BlockTier
}

/** Whether a block may mount, and why not. */
export interface MountVerdict {
  /** `true` when policy allows mounting now. */
  readonly allowed: boolean
  /** The rule that decided, phrased for a human. */
  readonly reason: string
}
