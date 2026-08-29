/**
 * `ctx.planGate` — nothing destructive happens until a human said yes to
 * *this specific* work.
 *
 * Invariant I8 says building is plan-gated, and §5.5 says a destructive index
 * change is gated the same way. Both wanted the same object, so there is one:
 * a proposal carrying a digest, a decision, and a single-use consumption.
 *
 * Three properties, and the middle one is the one that is usually missing.
 *
 * **Approval is per-plan, not per-session.** A consumed plan is terminal.
 * Approving a rebuild does not authorise the next rebuild, and an agent that
 * wants to act twice has to ask twice.
 *
 * **Approval binds to a digest.** Without one, "approve" means "yes, do
 * something like this", and the distance between the plan a human read and the
 * work that ran is unbounded — which is precisely the hole a plan card is
 * supposed to close. `consume` requires the executor to present the digest it
 * proposed, so a spec that changed between proposal and execution cannot run
 * under the old approval.
 *
 * **It is a mounted policy row, not a law.** With no `plan-gate` row there is no
 * gate, exactly as with no `tool-fs` row there is no filesystem tool (I3). The
 * architecture is explicit that plan mode is soft guidance and that sandbox mode
 * and approval policy are the real restrictions; this is the same, and it is
 * documented rather than implied.
 *
 * @module @se373/plan-gate
 */
import { Service } from '@se373/cordis';
import { randomUUID } from 'node:crypto';
import z from '@se373/schemastery';
import { canonicalDigest } from '@se373/digest';
export * from "./types.js";
/** Thrown when work is attempted without a matching approval. */
export class PlanNotApprovedError extends Error {
    /** Stable machine-readable code. */
    code = 'PLAN_NOT_APPROVED';
    constructor(message) {
        super(message);
        this.name = 'PlanNotApprovedError';
    }
}
/**
 * The approval gate.
 */
export class PlanGate extends Service {
    static name = 'plan-gate';
    static Config = z.object({
        autoApprove: z.boolean().default(false),
    });
    plans = new Map();
    autoApprove;
    constructor(ctx, config = {}) {
        super(ctx, 'planGate');
        this.autoApprove = config.autoApprove ?? false;
    }
    /** Replace a plan and announce the change. */
    transition(plan, next) {
        const updated = { ...plan, ...next };
        this.plans.set(plan.id, updated);
        this.ctx.emit('plan/decided', updated);
        return updated;
    }
    /**
     * Digest a subject the way {@link propose} does.
     *
     * Exposed so an executor can compute the digest it must present to
     * {@link consume} without reconstructing the plan.
     * @param subject - the thing being approved.
     * @returns lowercase hex SHA-256.
     */
    static digest(subject) {
        return canonicalDigest(subject);
    }
    /**
     * Propose work.
     * @param proposal - what will happen, and to what.
     * @returns the plan, already approved when `autoApprove` is set.
     */
    propose(proposal) {
        const plan = {
            id: randomUUID(),
            kind: proposal.kind,
            summary: proposal.summary,
            steps: [...proposal.steps],
            digest: PlanGate.digest(proposal.subject),
            detail: proposal.detail ?? {},
            createdAt: Date.now(),
            status: 'pending',
        };
        this.plans.set(plan.id, plan);
        this.ctx.emit('plan/proposed', plan);
        return this.autoApprove ? this.approve(plan.id) : plan;
    }
    /**
     * Look up a plan.
     * @param id - the plan id.
     * @returns the plan.
     * @throws when the id is unknown.
     */
    get(id) {
        const plan = this.plans.get(id);
        if (plan === undefined)
            throw new PlanNotApprovedError(`no plan ${id}`);
        return plan;
    }
    /** Every plan, newest first. */
    list() {
        return [...this.plans.values()].sort((left, right) => right.createdAt - left.createdAt);
    }
    /**
     * Approve a pending plan.
     * @param id - the plan id.
     * @returns the approved plan.
     * @throws when the plan is not pending.
     */
    approve(id) {
        const plan = this.get(id);
        if (plan.status !== 'pending') {
            throw new PlanNotApprovedError(`plan ${id} is ${plan.status}, not pending`);
        }
        return this.transition(plan, { status: 'approved' });
    }
    /**
     * Reject a pending plan.
     * @param id - the plan id.
     * @param reason - why, for the record.
     * @returns the rejected plan.
     */
    reject(id, reason) {
        const plan = this.get(id);
        if (plan.status !== 'pending') {
            throw new PlanNotApprovedError(`plan ${id} is ${plan.status}, not pending`);
        }
        return this.transition(plan, { status: 'rejected', ...reason === undefined ? {} : { reason } });
    }
    /**
     * Spend an approval on exactly the work it was given for.
     *
     * Both checks matter and they fail differently. A plan that is not approved
     * means nobody said yes. A digest mismatch means somebody said yes to
     * something else — which is the more dangerous of the two, because the
     * approval genuinely exists and only the subject moved.
     * @param id - the plan id.
     * @param digest - {@link PlanGate.digest} of the work about to run.
     * @returns the consumed plan.
     * @throws PlanNotApprovedError when unapproved, already spent, or mismatched.
     */
    consume(id, digest) {
        const plan = this.get(id);
        if (plan.status !== 'approved') {
            throw new PlanNotApprovedError(`plan ${id} is ${plan.status}; work may only run against an approved plan`);
        }
        if (plan.digest !== digest) {
            throw new PlanNotApprovedError(`plan ${id} was approved for ${plan.digest.slice(0, 12)}… but the work presented `
                + `${digest.slice(0, 12)}…. What was approved is not what is about to run.`);
        }
        return this.transition(plan, { status: 'consumed' });
    }
}
export default PlanGate;
//# sourceMappingURL=index.js.map