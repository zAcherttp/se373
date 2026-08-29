/**
 * Runtime invariant companion for `@se373/block-registry`.
 *
 * @module @se373/block-registry/invariant
 */
import { parseBlockRef } from "./index.js";
/**
 * Two rules, both about the repository staying a repository.
 *
 * **Versions are dense and monotonic from 1.** A gap or a repeat means a write
 * path appended out of order, and `id@version` — the form `forkedFrom` uses and
 * a comparison names — silently stops resolving to what it says.
 *
 * **Parentage resolves.** A `forkedFrom` pointing at a version that is not in
 * the repository turns the fork's provenance into decoration: the original may
 * have been the thing you wanted to compare against, and nothing would have
 * reported that it went missing. Persisted forks whose parent was a system block
 * are the realistic case, since system blocks are re-registered by their rows
 * and a disabled row means an absent parent.
 */
const check = Object.assign((ctx, fail) => {
    for (const latest of ctx.blocks.list()) {
        const versions = ctx.blocks.versions(latest.id);
        for (const [index, block] of versions.entries()) {
            if (block.version !== index + 1) {
                fail(`${latest.id} has versions [${versions.map(v => v.version).join(', ')}]; they must run 1..n`);
            }
        }
        if (latest.forkedFrom === undefined)
            continue;
        const parent = parseBlockRef(latest.forkedFrom);
        if (parent === null)
            fail(`${latest.id} records forkedFrom ${latest.forkedFrom}, which is not id@version`);
        if (ctx.blocks.at(parent.id, parent.version) === undefined) {
            fail(`${latest.id} was forked from ${latest.forkedFrom}, which is not in the repository`);
        }
    }
}, { inject: ['blocks'] });
/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx) {
    ctx.inject(['invariants'], (ctx) => {
        ctx.invariants.register('@se373/block-registry', check);
    });
}
//# sourceMappingURL=invariant.js.map