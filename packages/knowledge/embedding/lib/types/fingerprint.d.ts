/**
 * The index fingerprint: one digest that decides whether two sets of vectors
 * may be compared.
 *
 * The settled rule is that staleness is *computed*, never declared — a
 * model-authored config block can misstate a boolean, but it cannot forge a
 * hash of the bytes it actually loaded. This module is where that rule is paid
 * for on the embedding stage.
 *
 * Two properties matter and both are easy to lose by accident:
 *
 * 1. **Stability.** The same inputs must digest identically across processes,
 *    across Node versions, and regardless of the order in which fields were
 *    assembled. That is `@se373/digest`'s job, shared with every other
 *    write-path stage so the four of them cannot canonicalize differently.
 * 2. **Coverage.** Any field a caller can vary that changes a vector must be an
 *    input. The one deliberate exclusion is `modelId`, which is a registry row's
 *    human-facing name: renaming a row does not change a single vector, and
 *    making a rename invalidate a 300 MB index would teach people to avoid
 *    renaming rather than to trust the fingerprint.
 *
 * @module @se373/embedding/fingerprint
 */
import type { EmbedderIdentityInput } from './types.ts';
/**
 * The exact object that gets hashed.
 *
 * Split out from {@link fingerprintIdentity} so that a test can read what is
 * covered rather than infer it from a hex string, and so that adding a field to
 * {@link EmbedderIdentityInput} without adding it here is visible in one place.
 * @param input - a model identity, digest excluded.
 * @returns the digest inputs, artifacts sorted by path.
 */
export declare function fingerprintInputs(input: EmbedderIdentityInput): Record<string, unknown>;
/**
 * Digest a model identity.
 * @param input - a model identity, digest excluded.
 * @returns lowercase hex SHA-256.
 */
export declare function fingerprintIdentity(input: EmbedderIdentityInput): string;
/**
 * Complete an identity by computing its digest.
 * @param input - a model identity, digest excluded.
 * @returns the identity with `fingerprint` filled in.
 */
export declare function sealIdentity(input: EmbedderIdentityInput): EmbedderIdentityInput & {
    fingerprint: string;
};
//# sourceMappingURL=fingerprint.d.ts.map