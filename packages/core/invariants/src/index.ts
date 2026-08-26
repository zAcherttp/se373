/**
 * Registry of package-owned runtime invariant checks.
 *
 * A check is not a test. Tests run once, before mount; an invariant runs
 * continuously, in the live process, and catches a provider that satisfies its
 * contract on paper but drifts in operation. Every package contributes through
 * a `./invariant` companion so ordinary entrypoints stay free of diagnostics.
 *
 * Selection is a regex allowlist/blocklist over package names, so a noisy check
 * is disabled by config rather than deleted.
 *
 * @module @se373/invariants
 */

import { Context, Service } from '@se373/cordis'
import type { Inject } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'

/** Which package contributions run. */
export interface Config {
  /** Global switch. Defaults to `true`. */
  readonly enabled?: boolean
  /** Regex sources admitting package names. Empty admits all. */
  readonly allow?: string[]
  /** Regex sources excluding package names, applied after `allow`. */
  readonly deny?: string[]
}

/**
 * Report a violation of the registering package's contract.
 *
 * @param message - the violated contract, without the standard prefix.
 * @returns never; reporting always throws.
 */
export type InvariantFailure = (message: string) => never

/** Installs one package's checks into a context the registry owns. */
export interface InvariantInstaller {
  /**
   * @param ctx - child context scoped to this registration.
   * @param fail - reporter already bound to the registering package name.
   */
  (ctx: Context, fail: InvariantFailure): void | Promise<void>
  /** Services the installer's fiber may access. */
  readonly inject?: Inject
}

/**
 * A violated runtime invariant, attributed to the package that owns the check.
 *
 * `code` is the contract; `message` is for humans. A model repairing its own
 * block reads the code.
 */
export class InvariantError extends Error {
  /** Stable machine-readable code. */
  readonly code = 'INVARIANT' as const
  /** Full package name that registered the violated check. */
  readonly packageName: string

  constructor(packageName: string, message: string) {
    super(`invariant violated by "${packageName}": ${message}`)
    this.name = 'InvariantError'
    this.packageName = packageName
  }
}

declare module '@se373/cordis' {
  interface Context {
    invariants: InvariantRegistry
  }
}

/** Compile one filter list, rejecting blanks, duplicates, and bad patterns. */
function compile(field: 'allow' | 'deny', values: readonly string[]): RegExp[] {
  const seen = new Set<string>()
  return values.map((value) => {
    if (value.length === 0 || value.trim() !== value) {
      throw new Error(`invariants: ${field} entries must be non-blank and untrimmed-free`)
    }
    if (seen.has(value)) {
      throw new Error(`invariants: ${field} contains duplicate regex ${JSON.stringify(value)}`)
    }
    seen.add(value)
    try {
      return new RegExp(value)
    } catch (cause) {
      throw new Error(`invariants: ${field} contains invalid regex ${JSON.stringify(value)}`, { cause })
    }
  })
}

/** Package-owned runtime checks, selected by config, run in child fibers. */
export class InvariantRegistry extends Service {
  static Config: Schema<Config> = z.object({
    enabled: z.boolean().default(true),
    allow: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([]),
  })

  private readonly enabled: boolean
  private readonly owner: Context
  private readonly allow: readonly RegExp[]
  private readonly deny: readonly RegExp[]
  private readonly registered = new Set<string>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'invariants')
    this.owner = ctx
    this.enabled = config.enabled ?? true
    this.allow = compile('allow', config.allow ?? [])
    this.deny = compile('deny', config.deny ?? [])
  }

  /** Whether a package name passes the configured filters. */
  private selected(packageName: string): boolean {
    if (!this.enabled) return false
    if (this.allow.length > 0 && !this.allow.some(re => re.test(packageName))) return false
    return !this.deny.some(re => re.test(packageName))
  }

  /**
   * Register one package's checks.
   *
   * The name is reserved even when filtering disables the checks, so a
   * duplicate registration is still an error. Enabled installers run in a child
   * fiber; a failing install disposes that fiber and releases the reservation.
   *
   * @param packageName - full package name owning the contribution.
   * @param installer - installs the checks into a child context.
   * @returns a disposer; disposal is a reversible effect (I6).
   */
  register(packageName: string, installer: InvariantInstaller): () => void {
    if (packageName.length === 0 || /\s/.test(packageName)) {
      throw new Error('invariants: packageName must be non-blank and contain no whitespace')
    }
    if (this.registered.has(packageName)) {
      throw new Error(`invariants: package "${packageName}" is already registered`)
    }

    // Service method tracing rebinds `this.ctx` to the caller. Capturing the
    // owner keeps every registration and child fiber owned by the service.
    const owner = this.owner
    const registered = this.registered
    registered.add(packageName)

    const release = () => {
      registered.delete(packageName)
    }

    try {
      return owner.effect(async () => {
        if (!this.selected(packageName)) return release

        const install = (child: Context) => installer(child, (message): never => {
          throw new InvariantError(packageName, message)
        })

        try {
          const child = owner.plugin(installer.inject === undefined
            ? install
            : Object.assign(install, { inject: installer.inject }))
          try {
            await child
          } catch (error) {
            await child.dispose()
            throw error
          }
          return async () => {
            try {
              await child.dispose()
            } finally {
              release()
            }
          }
        } catch (error) {
          release()
          throw error
        }
      }, `invariants.register(${JSON.stringify(packageName)})`)
    } catch (error) {
      release()
      throw error
    }
  }
}

export default InvariantRegistry
