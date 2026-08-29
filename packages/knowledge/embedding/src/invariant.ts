/**
 * Runtime invariant companion for `@se373/embedding`.
 *
 * @module @se373/embedding/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'
import { describeIdentityFault } from './conformance.ts'
import type { Embedder } from './index.ts'

/**
 * Whatever is mounted on the seam must describe itself honestly.
 *
 * Read through `ctx.get` rather than injected, on purpose: a tree with the seam
 * declared and no provider is a legitimate state — that is what invariant I2's
 * blocked tier looks like from outside — and an injected check would simply
 * never run there, which is the wrong kind of silence. Reading it means the
 * check fires the moment a provider does mount.
 *
 * Only the free half of the conformance suite runs here. The behavioural half
 * loads 300 MB of weights, which is not a thing to do on every boot; it is
 * called where a generation is about to be written, which is the point at which
 * being wrong actually costs something.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    const embedder = ctx.get('embedder') as Embedder | undefined
    if (embedder === undefined) return
    const fault = describeIdentityFault(embedder.identity)
    if (fault !== null) fail(`mounted embedder ${embedder.identity.modelId}: ${fault}`)
  },
  { inject: [] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/embedding', check)
  })
}
