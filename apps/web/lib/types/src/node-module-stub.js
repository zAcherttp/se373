/**
 * Browser stand-in for `node:module`.
 *
 * The vendored Cordis loader imports `createRequire` for its Node module path,
 * which the browser boot never takes — the client module loader fills that slot
 * instead. Throwing rather than returning a no-op is the point: if the
 * assumption ever stops holding, it fails loudly at the call site instead of
 * resolving to something plausible.
 *
 * @module @se373/web-frontend/node-module-stub
 */
/** Throwing stand-in for `node:module`'s `createRequire`; never reached in the browser boot. */
export const createRequire = () => {
    throw new Error('node:module is not available in the browser');
};
//# sourceMappingURL=node-module-stub.js.map