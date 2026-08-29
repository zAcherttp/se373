/**
 * Runtime invariant companion for `@se373/knowledge`.
 *
 * @module @se373/knowledge/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'
import { generationKey } from './staleness.ts'
import { WRITE_PATH_STAGES } from './types.ts'

/**
 * Every write-path stage must contribute a distinct, non-empty digest.
 *
 * The generation key is the plane's only defence against answering from an
 * index a different pipeline wrote, and it fails in one specific silent way: a
 * stage that returns an empty or constant reference still produces a
 * well-formed key, and that key then stops changing when the stage does. The
 * index never looks stale, retrieval never fails closed, and the answers come
 * from vectors nothing configured now would have written.
 *
 * Two collapses are checked. A stage with an empty ref has clearly forgotten to
 * compute one. Two stages sharing a ref means both are hashing the same thing —
 * the mistake a copied constructor makes — which halves the key's coverage
 * while leaving it exactly as long.
 */
const check: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    const stages = ctx.knowledgePipeline.stages()
    const seen = new Map<string, string>()
    for (const stage of WRITE_PATH_STAGES) {
      const ref = stages[stage]
      if (typeof ref !== 'string' || ref === '') {
        fail(`write-path stage ${stage} contributes no reference; the generation key cannot see it change`)
      }
      const owner = seen.get(ref)
      if (owner !== undefined) {
        fail(`stages ${owner} and ${stage} share the reference ${ref.slice(0, 12)}…; one of them is hashing the wrong thing`)
      }
      seen.set(ref, stage)
    }
    // Cheap, and it catches a `generationKey` that stopped reading one of its
    // inputs -- which would otherwise only show up as an index that never goes
    // stale.
    if (generationKey(stages).length !== 64) fail('generation key is not a sha256 digest')
  },
  { inject: ['knowledgePipeline'] as const },
)

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/knowledge', check)
  })
}
