/**
 * Runtime invariant companion for `@se373/hello`.
 *
 * Demonstrates the `./invariant` export convention every package follows: the
 * ordinary entrypoint stays free of diagnostics, and the check is selectable by
 * config rather than by deletion.
 *
 * @module @se373/hello/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

/**
 * The installer runs in a child fiber the registry owns, NOT in the caller's
 * context, so services it touches must be declared on the installer itself.
 * Wrapping the caller in `ctx.inject` is not enough.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    // Trivial by design; the point is the wiring, not the check.
    if (ctx.hello.ticks < 0) fail('tick counter went negative')
  },
  { inject: ['hello'] as const },
)

export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/hello', check)
  })
}
