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
import { Service } from '@se373/cordis';
import { dshHomePath } from '@se373/home-paths';
import z from '@se373/schemastery';
import { acquireRow } from "./acquire.js";
import { BUILTIN_MODELS, DEFAULT_MODEL_ID } from "./catalog.js";
import { modelDir, resolveRow, rowBytes, verifyRow } from "./cache.js";
export * from "./types.js";
export { BUILTIN_MODELS, DEFAULT_MODEL_ID } from "./catalog.js";
export { modelDir, resolveRow, rowBytes, verifyRow } from "./cache.js";
export { acquireRow } from "./acquire.js";
/** Environment override for the cache root. */
export const MODELS_ROOT_ENV = 'SE373_MODELS_ROOT';
/**
 * The declared model catalog and the cache behind it.
 */
export class ModelRegistryService extends Service {
    static name = 'model-registry';
    static Config = z.object({
        root: z.string(),
        models: z.array(z.any()).default([]),
    });
    /** Cache root; every path this service returns is under it. */
    root;
    rows;
    constructor(ctx, config = {}) {
        super(ctx, 'modelRegistry');
        this.root = config.root ?? process.env[MODELS_ROOT_ENV] ?? dshHomePath('models');
        this.rows = new Map(BUILTIN_MODELS.map(row => [row.id, row]));
        // Config wins on id collision, so a shipped row can be re-pinned to a newer
        // revision without editing the package -- which is invariant I3 applied to
        // model weights rather than to plugins.
        for (const row of config.models ?? [])
            this.rows.set(row.id, row);
    }
    /** Every declared row, shipped and configured. */
    list() {
        return [...this.rows.values()];
    }
    /**
     * Rows able to produce a given width.
     *
     * The filter is over `mrlDims`, not over `nativeDims >= dims`: only a
     * Matryoshka-trained model may be truncated, and slicing an ordinary
     * embedding to a prefix produces a vector that is well-formed and meaningless.
     * @param dims - the width a generation needs.
     * @returns candidate rows.
     */
    candidates(dims) {
        return this.list().filter(row => row.mrlDims.includes(dims));
    }
    /**
     * Look up a row.
     * @param id - a row id; defaults to the shipped default.
     * @returns the row.
     * @throws Error naming every known id when the id is unknown.
     */
    row(id = DEFAULT_MODEL_ID) {
        const row = this.rows.get(id);
        if (row === undefined) {
            throw new Error(`unknown model ${JSON.stringify(id)}; declared: ${this.list().map(r => r.id).join(', ')}`);
        }
        return row;
    }
    /**
     * Whether a row's bytes are on disk.
     * @param id - a row id; defaults to the shipped default.
     * @returns `ready` with paths, or `missing` with a remedy.
     */
    async resolve(id) {
        return resolveRow(this.root, this.row(id));
    }
    /**
     * Fetch whatever a row is missing.
     *
     * A no-op when the row already resolves, so it is safe to call repeatedly and
     * safe to call after an interrupted run.
     * @param id - a row id; defaults to the shipped default.
     * @param options - progress and cancellation.
     * @returns the resolution afterwards, which is `ready` on success.
     */
    async acquire(id, options = {}) {
        const row = this.row(id);
        const before = await resolveRow(this.root, row);
        if (before.status === 'ready')
            return before;
        await acquireRow(this.root, row, before.missing, options);
        return resolveRow(this.root, row);
    }
    /**
     * Re-hash a row's files against their pinned digests.
     * @param id - a row id; defaults to the shipped default.
     * @returns repository-relative paths that did not match; empty is a pass.
     */
    async verify(id) {
        return verifyRow(this.root, this.row(id));
    }
    /**
     * Where a row's files live, whether or not they are there.
     * @param id - a row id; defaults to the shipped default.
     * @returns an absolute directory.
     */
    directory(id) {
        return modelDir(this.root, this.row(id));
    }
    /**
     * Total transfer size of a row.
     * @param id - a row id; defaults to the shipped default.
     * @returns bytes.
     */
    bytes(id) {
        return rowBytes(this.row(id));
    }
}
export default ModelRegistryService;
//# sourceMappingURL=index.js.map