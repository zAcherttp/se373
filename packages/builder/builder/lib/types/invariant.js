/**
 * Runtime invariant companion for `@se373/builder`.
 *
 * @module @se373/builder/invariant
 */
/**
 * No two fabricated agents may share an isolation realm.
 *
 * §6.3 names this as the failure mode to guard **at registration**: a row
 * publishing into the root realm is process-global, so a second fabrication of
 * the same seam silently resolves one instance for everybody, and a host reader
 * cannot tell which. Upstream's preset package re-checks it on every service
 * notification; this is the same check on our own fabrications.
 *
 * It fails loud at load rather than at demo, which is the whole reason to have
 * it: two agents that appear to work and quietly answer from one index look
 * exactly like two agents that work.
 */
const check = Object.assign((ctx, fail) => {
    const owner = new Map();
    for (const agent of ctx.builder.list()) {
        const realm = `${agent.spec.name}-v${agent.spec.version}`;
        for (const seam of agent.spec.isolates) {
            const key = `${seam}@${realm}`;
            const existing = owner.get(key);
            if (existing !== undefined) {
                fail(`${agent.entryId} and ${existing} both publish ${seam} into realm "${realm}"`);
            }
            owner.set(key, agent.entryId);
        }
    }
}, { inject: ['builder'] });
/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx) {
    ctx.inject(['invariants'], (ctx) => {
        ctx.invariants.register('@se373/builder', check);
    });
}
//# sourceMappingURL=invariant.js.map