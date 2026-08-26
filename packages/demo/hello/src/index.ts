/**
 * Phase-1 proof plugin.
 *
 * Exists to demonstrate, in the smallest possible surface, the five things
 * phase 1 must establish: the loader mounts a plugin tree, a fiber owns it,
 * config arrives as a validated row, a service publishes onto the context, and
 * **teardown unwinds** — every registration is a reversible effect (I6).
 *
 * Delete this package once a real service occupies the same ground.
 *
 * @module @se373/hello
 */

import { Context, Service } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'

export interface Config {
  /** Who to greet. */
  readonly greeting?: string
  /** Emit a tick on an interval, to prove the disposer stops it. */
  readonly tickMs?: number
}

declare module '@se373/cordis' {
  interface Context {
    hello: HelloService
  }
}

/** Publishes `ctx.hello`, holding one timer whose disposal must be observable. */
export class HelloService extends Service {
  static Config: Schema<Config> = z.object({
    greeting: z.string().default('se373'),
    tickMs: z.natural().default(0),
  })

  /** Ticks emitted since start. Read by the invariant companion. */
  ticks = 0

  private readonly greeting: string
  private readonly tickMs: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'hello')
    this.greeting = config.greeting ?? 'se373'
    this.tickMs = config.tickMs ?? 0
  }

  /**
   * Cordis runs this after construction, once the fiber activates.
   *
   * Written as an async generator because that is the idiom for lifecycle work
   * that must unwind: every `yield`ed disposer runs on teardown, in reverse.
   * A leaked timer here is exactly the class of bug that only surfaces on the
   * second hot reload, so the demo makes disposal audible.
   */
  async* [Service.init](): AsyncGenerator<() => void, void, void> {
    this.ctx.logger.info('hello, %s', this.greeting)

    if (this.tickMs <= 0) return

    const timer = setInterval(() => {
      this.ticks += 1
      this.ctx.logger.debug('tick %d', this.ticks)
    }, this.tickMs)

    yield () => {
      clearInterval(timer)
      this.ctx.logger.info('hello disposed after %d tick(s)', this.ticks)
    }
  }

  /** Greet by name, so there is something to call across the seam. */
  greet(name: string): string {
    return `hello ${name}, from ${this.greeting}`
  }
}

export default HelloService
