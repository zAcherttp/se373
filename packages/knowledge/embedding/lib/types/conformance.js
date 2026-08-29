/**
 * What a provider must satisfy to be allowed to write an index.
 *
 * Split deliberately in two, because the two halves cost different amounts:
 *
 * - {@link describeIdentityFault} is structural and free. It runs at every boot
 *   from the seam's invariant companion, against whatever is actually mounted.
 * - {@link assertEmbedderConformance} is behavioural and expensive — it runs the
 *   model. It is called by the demo and by anything about to build a generation,
 *   not at boot, because loading 300 MB of weights to answer "did this row
 *   mount" would make the boot check the slowest thing in the process.
 *
 * This is the shape invariant I7 asks for — authored code mounts only after
 * passing its seam conformance suite — arriving early because the embedding
 * seam is the first one with two plausible providers.
 *
 * @module @se373/embedding/conformance
 */
import { fingerprintIdentity } from "./fingerprint.js";
import { templateFault } from "./template.js";
import { EMBED_ROLES } from "./types.js";
/** A 64-character lowercase hex digest. */
const SHA256 = /^[0-9a-f]{64}$/;
/** A full git commit sha. */
const COMMIT = /^[0-9a-f]{40}$/;
/**
 * Why an identity is unusable, or `null` if it is well formed.
 *
 * Every rule here guards a failure that produces vectors rather than an error.
 * The two worth naming: a `revision` that is a branch rather than a commit makes
 * the fingerprint a promise about bytes that can change underneath it; and a
 * `fingerprint` that does not recompute means someone edited an identity field
 * without re-digesting, which is precisely the "declared, not computed"
 * staleness flag the design rejects.
 * @param identity - the identity to check.
 * @returns a human-readable fault, or `null`.
 */
export function describeIdentityFault(identity) {
    if (!COMMIT.test(identity.revision)) {
        return `revision ${JSON.stringify(identity.revision)} is not a commit sha; a branch is not a set of bytes`;
    }
    if (identity.artifacts.length === 0)
        return 'declares no artifacts';
    for (const artifact of identity.artifacts) {
        if (!SHA256.test(artifact.sha256))
            return `artifact ${artifact.file} has a malformed sha256`;
        if (!Number.isInteger(artifact.bytes) || artifact.bytes <= 0) {
            return `artifact ${artifact.file} declares ${artifact.bytes} bytes`;
        }
    }
    if (!Number.isInteger(identity.nativeDims) || identity.nativeDims <= 0) {
        return `nativeDims is ${identity.nativeDims}`;
    }
    if (!Number.isInteger(identity.dims) || identity.dims <= 0 || identity.dims > identity.nativeDims) {
        return `dims ${identity.dims} is not in 1..${identity.nativeDims}`;
    }
    if (!Number.isInteger(identity.maxTokens) || identity.maxTokens <= 0) {
        return `maxTokens is ${identity.maxTokens}`;
    }
    for (const role of EMBED_ROLES) {
        const fault = templateFault(identity.templates[role]);
        if (fault !== null)
            return `${role} template ${fault}`;
    }
    const expected = fingerprintIdentity(identity);
    if (expected !== identity.fingerprint) {
        return `fingerprint is ${identity.fingerprint} but its fields digest to ${expected}`;
    }
    return null;
}
/** Euclidean length. */
function magnitude(vector) {
    let sum = 0;
    for (const value of vector)
        sum += value * value;
    return Math.sqrt(sum);
}
/** Largest absolute component-wise difference. */
function maxDelta(left, right) {
    let worst = 0;
    for (let i = 0; i < left.length; i += 1)
        worst = Math.max(worst, Math.abs(left[i] - right[i]));
    return worst;
}
/**
 * Run the behavioural suite against a live provider.
 *
 * The role check is the one that earns this function's existence. A provider
 * that accepts `role` and ignores it passes every other check here — the shapes
 * are right, the norms are right, the fingerprint matches — and produces an
 * index whose recall is quietly worse than it should be. Nothing else notices.
 * @param embedder - a provider whose readiness is `ready`.
 * @throws Error naming the first violated rule.
 */
export async function assertEmbedderConformance(embedder) {
    const { identity } = embedder;
    const fault = describeIdentityFault(identity);
    if (fault !== null)
        throw new Error(`identity: ${fault}`);
    if (embedder.readiness !== 'ready') {
        throw new Error(`readiness is ${embedder.readiness}; conformance needs a loaded model`);
    }
    const texts = ['the red planet', 'hành tinh đỏ'];
    const first = await embedder.embed(texts, 'document');
    if (first.vectors.length !== texts.length) {
        throw new Error(`embedded ${texts.length} texts and got ${first.vectors.length} vectors`);
    }
    if (first.fingerprint !== identity.fingerprint) {
        throw new Error(`result claims fingerprint ${first.fingerprint}, identity says ${identity.fingerprint}`);
    }
    if (first.dims !== identity.dims) {
        throw new Error(`result claims ${first.dims} dims, identity says ${identity.dims}`);
    }
    for (const [index, vector] of first.vectors.entries()) {
        if (vector.length !== identity.dims) {
            throw new Error(`vector ${index} has ${vector.length} components, expected ${identity.dims}`);
        }
        if (!vector.every(Number.isFinite))
            throw new Error(`vector ${index} contains a non-finite component`);
        if (identity.normalize && Math.abs(magnitude(vector) - 1) > 1e-3) {
            throw new Error(`vector ${index} has magnitude ${magnitude(vector)}, expected 1 (normalize is on)`);
        }
    }
    const again = await embedder.embed(texts, 'document');
    for (const [index, vector] of first.vectors.entries()) {
        if (maxDelta(vector, again.vectors[index]) > 1e-5) {
            throw new Error(`vector ${index} is not deterministic across two calls`);
        }
    }
    if (identity.templates.document !== identity.templates.query) {
        const asQuery = await embedder.embed([texts[0]], 'query');
        if (maxDelta(first.vectors[0], asQuery.vectors[0]) < 1e-5) {
            throw new Error('document and query templates differ but produce identical vectors: role is being ignored');
        }
    }
}
//# sourceMappingURL=conformance.js.map