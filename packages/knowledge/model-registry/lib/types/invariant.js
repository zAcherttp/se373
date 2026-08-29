/**
 * Runtime invariant companion for `@se373/model-registry`.
 *
 * @module @se373/model-registry/invariant
 */
/** Every repository-relative path a row says it will open. */
function namedFiles(row) {
    const { onnx, onnxData, tokenizer, tokenizerConfig } = row.files;
    return [onnx, onnxData, tokenizer, tokenizerConfig].filter((file) => file !== undefined);
}
/**
 * A declared row must be internally consistent before anything tries to use it.
 *
 * The first rule is the one worth having. `files` says what the provider opens;
 * `artifacts` says what gets downloaded and verified. A path in the first and
 * not the second is never fetched and never checked — so `resolve` reports
 * `ready`, acquisition reports success, and the failure surfaces much later as
 * an ONNX loader error about a missing external-data file, at which point
 * nothing points back at the row. Adding an `onnxData` sidecar without its
 * digest is exactly how that happens, and it is a one-line mistake.
 *
 * The second rule guards the opposite direction: a `dims` outside `mrlDims`
 * would truncate a non-Matryoshka embedding to a prefix, which yields vectors
 * that are the right shape, normalize cleanly, and mean nothing.
 */
const check = Object.assign((ctx, fail) => {
    for (const row of ctx.modelRegistry.list()) {
        const pinned = new Set(row.artifacts.map(artifact => artifact.file));
        const unpinned = namedFiles(row).filter(file => !pinned.has(file));
        if (unpinned.length > 0) {
            fail(`model ${row.id} names ${unpinned.join(', ')} in files but pins no digest for them`);
        }
        if (!row.mrlDims.includes(row.dims)) {
            fail(`model ${row.id} defaults to ${row.dims} dims, which is not among [${row.mrlDims.join(', ')}]`);
        }
        if (!row.mrlDims.includes(row.nativeDims)) {
            fail(`model ${row.id} omits its own native width ${row.nativeDims} from [${row.mrlDims.join(', ')}]`);
        }
    }
}, { inject: ['modelRegistry'] });
/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx) {
    ctx.inject(['invariants'], (ctx) => {
        ctx.invariants.register('@se373/model-registry', check);
    });
}
//# sourceMappingURL=invariant.js.map