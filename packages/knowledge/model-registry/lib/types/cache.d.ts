/**
 * Where model bytes live, and how we decide we have them.
 *
 * The cache mirrors the repository's own paths under
 * `$SE373_HOME/models/<repo>/<revision>/`. Two reasons, both load-bearing:
 * ONNX external-data sidecars are referenced *by relative filename from inside
 * the graph*, so flattening or renaming would break loading in a way that only
 * shows up at inference; and keying by revision means two pinned revisions of
 * the same repo coexist, which is what lets an old index keep serving while a
 * new one builds.
 *
 * **Presence is size-checked, not hashed.** Hashing 300 MB on every boot would
 * make the cheapest question in the system the slowest, so `resolve` compares
 * byte length against the row's pinned size — which catches the realistic
 * failure, a truncated or interrupted transfer — and full verification is a
 * separate deliberate call. There is no "verified" marker file anywhere: a
 * marker would be a declared flag about freshness, which is exactly the thing
 * this project refuses to trust.
 *
 * @module @se373/model-registry/cache
 */
import type { ModelResolution, ModelRow } from './types.ts';
/**
 * The directory a row's files live in.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns an absolute directory path.
 */
export declare function modelDir(root: string, row: ModelRow): string;
/**
 * Total transfer size of a row.
 * @param row - the declared model.
 * @returns bytes.
 */
export declare function rowBytes(row: ModelRow): number;
/**
 * Decide whether a row's bytes are on disk.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns a resolution naming every absent file when incomplete.
 */
export declare function resolveRow(root: string, row: ModelRow): Promise<ModelResolution>;
/**
 * Re-hash every file of a row against its pinned digest.
 *
 * The expensive check `resolve` deliberately skips. Called after acquisition,
 * and by hand when a model is suspected of being wrong.
 * @param root - the models cache root.
 * @param row - the declared model.
 * @returns repository-relative paths whose contents did not match; empty is a pass.
 */
export declare function verifyRow(root: string, row: ModelRow): Promise<string[]>;
//# sourceMappingURL=cache.d.ts.map