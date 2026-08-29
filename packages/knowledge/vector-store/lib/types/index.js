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
import { Service } from '@se373/cordis';
export * from "./types.js";
export { assertComparable } from "./guard.js";
/**
 * Abstract vector store.
 *
 * Every write and every read takes an {@link EmbedResult} rather than bare
 * vectors, so the producing fingerprint travels with the numbers and the store
 * can refuse a mismatch. A signature taking `Float32Array[]` would make that
 * check optional, and an optional correctness check in a retrieval system is a
 * check that is absent on the day it matters.
 */
export class VectorStore extends Service {
    constructor(ctx) {
        super(ctx, 'vectorStore');
    }
}
export default VectorStore;
//# sourceMappingURL=index.js.map