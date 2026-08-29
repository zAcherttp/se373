/**
 * Fetching model bytes, once, on purpose.
 *
 * Two properties this has to have.
 *
 * **A partial download must never resolve as ready.** Each file streams to a
 * `.partial` sibling, is hashed as it is written, and is renamed into place only
 * after its digest matches. An interrupted transfer therefore leaves debris that
 * `resolve` correctly reports as missing, rather than a plausible-looking file
 * that fails at inference much later.
 *
 * **The digest is checked against the pin, not against the server.** Hugging
 * Face's `x-linked-etag` carries a SHA-256 we could compare to, but comparing a
 * download to a header the same response supplied verifies only that the
 * transfer was intact. The row's pinned digest is what makes the fingerprint a
 * statement about bytes.
 *
 * @module @se373/model-registry/acquire
 */
import type { AcquireOptions, ModelRow } from './types.ts';
/** Structural minimum of an artifact, so `cache.ts` need not be imported for it. */
export interface ArtifactTarget {
    readonly file: string;
    readonly sha256: string;
    readonly bytes: number;
}
/**
 * Fetch every file a row declares that is not already present.
 *
 * Not plan-gated here. The gate belongs to whatever *invokes* this — a script a
 * human ran, or, once the builder plane exists, an approved plan — and putting
 * a prompt inside a library function would make it unusable from both.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @param outstanding - repository-relative paths to fetch.
 * @param options - progress and cancellation.
 */
export declare function acquireRow(root: string, row: ModelRow, outstanding: readonly string[], options?: AcquireOptions): Promise<void>;
//# sourceMappingURL=acquire.d.ts.map