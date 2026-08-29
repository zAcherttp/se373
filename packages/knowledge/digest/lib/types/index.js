/**
 * One canonical digest, used by every stage of the write path.
 *
 * The knowledge plane's central rule is that staleness is **computed, never
 * declared**: a model-authored config block can misstate a boolean, but it
 * cannot forge a hash of what it resolved to. That rule is only as good as the
 * hash, and a hash has exactly two ways to betray it —
 *
 * 1. **Instability.** `JSON.stringify` preserves insertion order, so the same
 *    config assembled in a different sequence digests differently and a rebuild
 *    that should have been a no-op throws away a working index.
 * 2. **Divergence.** Four stages each rolling their own `createHash` is four
 *    chances to canonicalize differently, and the day two of them disagree is
 *    the day a genuine change reads as no change.
 *
 * So there is one implementation, in one package with no dependencies, and
 * every stage reference in the plane is a call to it.
 *
 * @module @se373/digest
 */
import { createHash } from 'node:crypto';
/**
 * JSON with object keys sorted at every depth.
 *
 * Arrays keep their order, because array order is usually meaningful input —
 * a list of corpus roots, a chunker's separator ladder. Callers that mean a
 * *set* sort before calling.
 * @param value - any JSON-representable value.
 * @returns canonical JSON text.
 */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys
        .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`;
}
/**
 * Digest any JSON-representable value, stably.
 * @param value - the value to digest.
 * @returns lowercase hex SHA-256.
 */
export function canonicalDigest(value) {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
/**
 * Digest a stage: what it is, plus what it was configured with.
 *
 * The provider's package name is an input because two providers configured
 * identically are still two providers — `chunker-recursive` at size 800 and
 * `chunker-markdown` at size 800 produce different chunks from the same
 * document, and an index built by one must not be extended by the other.
 * @param providerName - the package that implements the stage.
 * @param config - the stage's resolved configuration.
 * @returns lowercase hex SHA-256.
 */
export function stageDigest(providerName, config) {
    return canonicalDigest({ provider: providerName, config });
}
/**
 * SHA-256 of text, for content identity.
 *
 * Separate from {@link canonicalDigest} on purpose: a document's content hash
 * is over its bytes, not over a JSON encoding of them, so it is comparable to a
 * digest computed by anything else that reads the same file.
 * @param text - the content.
 * @returns lowercase hex SHA-256.
 */
export function contentDigest(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
//# sourceMappingURL=index.js.map