/**
 * `ctx.vectorStore` — where vectors live, in generations.
 *
 * A **seam**: pick one. Swapping sqlite-vec for something else is a config-row
 * edit (I3), and the two would not coexist — a second store is a second index,
 * not a second opinion about the same one.
 *
 * Same shape as the embedding seam and for the same reason: a `declare module`
 * plus an abstract base, never a row that "declares" the name. `ctx.provide`
 * claims ownership, so a declaring row would collide with the first real
 * provider.
 *
 * @module @se373/vector-store
 */

import { Context, Service } from '@se373/cordis'
import type { EmbedderIdentity, EmbedResult } from '@se373/embedding'
import type { Generation, Hit, VectorRecord } from './types.ts'

export * from './types.ts'
export { assertComparable } from './guard.ts'

declare module '@se373/cordis' {
  interface Context {
    vectorStore: VectorStore
  }
}

/**
 * Abstract vector store.
 *
 * Every write and every read takes an {@link EmbedResult} rather than bare
 * vectors, so the producing fingerprint travels with the numbers and the store
 * can refuse a mismatch. A signature taking `Float32Array[]` would make that
 * check optional, and an optional correctness check in a retrieval system is a
 * check that is absent on the day it matters.
 */
export abstract class VectorStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'vectorStore')
  }

  /**
   * Start a new generation bound to an embedder identity.
   * @param identity - the model that will write every row.
   * @returns the new generation, `status: 'building'`.
   */
  abstract create(identity: EmbedderIdentity): Promise<Generation>
  /** Every generation, newest first. */
  abstract list(): Promise<Generation[]>
  /** The generation queries should go to, or `null` if none is active. */
  abstract active(): Promise<Generation | null>
  /**
   * Mark a generation ready and make it the active one.
   * @param id - the generation to flip to.
   */
  abstract activate(id: string): Promise<void>
  /**
   * Delete a generation and its storage.
   * @param id - the generation to drop.
   */
  abstract drop(id: string): Promise<void>
  /**
   * Insert or replace rows.
   * @param id - the generation to write to.
   * @param records - chunk descriptors, positionally paired with `embedded.vectors`.
   * @param embedded - vectors carrying the fingerprint that produced them.
   * @throws when the fingerprint or width disagrees with the generation.
   */
  abstract upsert(id: string, records: readonly VectorRecord[], embedded: EmbedResult): Promise<void>
  /**
   * Nearest neighbours.
   * @param id - the generation to read.
   * @param embedded - exactly one query vector, carrying its fingerprint.
   * @param k - how many hits to return.
   * @throws when the fingerprint or width disagrees with the generation.
   */
  abstract query(id: string, embedded: EmbedResult, k: number): Promise<Hit[]>
}

export default VectorStore
