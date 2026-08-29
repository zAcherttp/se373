/**
 * `ctx.modelRegistry` — which models exist, whether we have them, and how to get
 * them.
 *
 * A **core service, not a seam.** There is one cache directory and one set of
 * declared rows per process; a second registry would not be an alternative
 * implementation, it would be a second opinion about what is on disk.
 *
 * The reason this is a separate package from the embedder is that the questions
 * are different. "Which models could serve a 256-dimensional generation" and
 * "are these bytes here" are about *files*, and they outlive the embedding seam
 * — a cross-encoder reranker is the same question with different weights. So the
 * registry knows nothing about inference, and the provider knows nothing about
 * downloading.
 *
 * @module @se373/model-registry
 */
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import type { AcquireOptions, ModelResolution, ModelRow } from './types.ts';
export * from './types.ts';
export { BUILTIN_MODELS, DEFAULT_MODEL_ID } from './catalog.ts';
export { modelDir, resolveRow, rowBytes, verifyRow } from './cache.ts';
export { acquireRow } from './acquire.ts';
declare module '@se373/cordis' {
    interface Context {
        modelRegistry: ModelRegistryService;
    }
}
/** Environment override for the cache root. */
export declare const MODELS_ROOT_ENV = "SE373_MODELS_ROOT";
/** Configuration for the model registry. */
export interface Config {
    /**
     * Cache root.
     *
     * Resolution order is config, then `$SE373_MODELS_ROOT`, then
     * `$SE373_HOME/models`. The environment step exists because model weights are
     * hundreds of megabytes and are not anybody's *data*: a run with a throwaway
     * home — every demo and every spec — should not mean a re-download, and two
     * checkouts on one machine should be able to share one cache. Logs and
     * sessions correctly follow the home; weights correctly do not have to.
     */
    readonly root?: string;
    /**
     * Extra rows, merged over the shipped catalog by `id`.
     *
     * Declared as a loose record rather than a full schema: a row is a long,
     * digest-bearing literal, and the useful validation of one is
     * `describeIdentityFault`, which runs against the identity it produces. A
     * second, partial schema here would reject nothing the identity check does not
     * and would drift from it.
     */
    readonly models?: readonly ModelRow[];
}
/**
 * The declared model catalog and the cache behind it.
 */
export declare class ModelRegistryService extends Service {
    static readonly name = "model-registry";
    static readonly Config: Schema<Config>;
    /** Cache root; every path this service returns is under it. */
    readonly root: string;
    private readonly rows;
    constructor(ctx: Context, config?: Config);
    /** Every declared row, shipped and configured. */
    list(): ModelRow[];
    /**
     * Rows able to produce a given width.
     *
     * The filter is over `mrlDims`, not over `nativeDims >= dims`: only a
     * Matryoshka-trained model may be truncated, and slicing an ordinary
     * embedding to a prefix produces a vector that is well-formed and meaningless.
     * @param dims - the width a generation needs.
     * @returns candidate rows.
     */
    candidates(dims: number): ModelRow[];
    /**
     * Look up a row.
     * @param id - a row id; defaults to the shipped default.
     * @returns the row.
     * @throws Error naming every known id when the id is unknown.
     */
    row(id?: string): ModelRow;
    /**
     * Whether a row's bytes are on disk.
     * @param id - a row id; defaults to the shipped default.
     * @returns `ready` with paths, or `missing` with a remedy.
     */
    resolve(id?: string): Promise<ModelResolution>;
    /**
     * Fetch whatever a row is missing.
     *
     * A no-op when the row already resolves, so it is safe to call repeatedly and
     * safe to call after an interrupted run.
     * @param id - a row id; defaults to the shipped default.
     * @param options - progress and cancellation.
     * @returns the resolution afterwards, which is `ready` on success.
     */
    acquire(id?: string, options?: AcquireOptions): Promise<ModelResolution>;
    /**
     * Re-hash a row's files against their pinned digests.
     * @param id - a row id; defaults to the shipped default.
     * @returns repository-relative paths that did not match; empty is a pass.
     */
    verify(id?: string): Promise<string[]>;
    /**
     * Where a row's files live, whether or not they are there.
     * @param id - a row id; defaults to the shipped default.
     * @returns an absolute directory.
     */
    directory(id?: string): string;
    /**
     * Total transfer size of a row.
     * @param id - a row id; defaults to the shipped default.
     * @returns bytes.
     */
    bytes(id?: string): number;
}
export default ModelRegistryService;
//# sourceMappingURL=index.d.ts.map