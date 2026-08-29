/**
 * `ctx.reranker` that keeps the store's own order — the default provider.
 *
 * Not a no-op. The pipeline over-fetches so that the post-retrieve waterfall
 * has candidates to dedup and diversify; this is the stage that reduces the
 * survivors back to `k`. What it declines to do is *rescore*, which is the part
 * that would need a second model.
 *
 * It is the honest default for the same reason `embedder-onnx-local` is: a
 * cross-encoder is another download and another forward pass per candidate, and
 * invariant I2 says the plane has to answer before anyone has paid either cost.
 *
 * @module @se373/rerank-none
 */

import { Context } from '@se373/cordis'
import { stageDigest } from '@se373/digest'
import { Reranker } from '@se373/rerank'
import type { Hit } from '@se373/vector-store'

/**
 * Order-preserving top-k reducer.
 */
export class PassthroughReranker extends Reranker {
  static override readonly name = 'rerank-none'

  readonly rerankerRef: string

  constructor(ctx: Context) {
    super(ctx)
    this.rerankerRef = stageDigest(PassthroughReranker.name, {})
  }

  /** One line a human reads in the index status. */
  describe(): string {
    return 'none (vector order, top-k only)'
  }

  /**
   * Keep the first `k` candidates in the order the store returned them.
   * @param _query - unused; this provider does not rescore.
   * @param hits - candidates, nearest first.
   * @param k - how many to return.
   * @returns at most `k` hits.
   */
  async rerank<T extends Hit>(_query: string, hits: readonly T[], k: number): Promise<T[]> {
    return hits.slice(0, k)
  }
}

export default PassthroughReranker
