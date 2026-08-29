/**
 * The vocabulary of the embedding seam.
 *
 * Two ideas carry everything else here.
 *
 * **A model's identity is what changes its output, not what it is called.** Two
 * rows naming `embeddinggemma-300m` that differ in truncated dimensionality, in
 * prompt template, or in the bytes their revision resolves to produce vectors
 * that cannot be compared, and nothing about the comparison fails — it just
 * returns confident nonsense. So identity is a digest over every such field, and
 * the model *name* is not one of the inputs that matters.
 *
 * **A vector is never separated from the identity that produced it.** That is
 * why {@link EmbedResult} is a batch carrying one fingerprint rather than a bare
 * `Float32Array[]`: a store cannot forget to check what it was handed if the
 * check is on the value it receives.
 *
 * @module @se373/embedding/types
 */
/** Every role, for exhaustive iteration. */
export const EMBED_ROLES = ['document', 'query'];
//# sourceMappingURL=types.js.map