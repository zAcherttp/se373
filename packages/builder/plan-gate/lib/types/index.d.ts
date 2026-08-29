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
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import type { Plan, PlanStep } from './types.ts';
export * from './types.ts';
declare module '@se373/cordis' {
    interface Context {
        planGate: PlanGate;
    }
    interface Events {
        /**
         * A plan was proposed and is awaiting a decision.
         * @param plan - the proposal.
         * @mode emit
         */
        'plan/proposed'(plan: Plan): void;
        /**
         * A plan was approved, rejected or consumed.
         * @param plan - the plan in its new status.
         * @mode emit
         */
        'plan/decided'(plan: Plan): void;
    }
}
/** What a proposer supplies. */
export interface Proposal {
    /** Work class — `agent-fabrication`, `index-rebuild`. */
    readonly kind: string;
    /** One line naming the outcome. */
    readonly summary: string;
    /** The ordered steps, phrased for a human. */
    readonly steps: readonly PlanStep[];
    /**
     * The thing being approved, in whatever shape the proposer uses.
     *
     * Digested, never stored raw, so the gate can bind an approval to it without
     * understanding it.
     */
    readonly subject: unknown;
    /** Anything worth showing alongside; not digested. */
    readonly detail?: Readonly<Record<string, unknown>>;
}
/** Configuration for the plan gate. */
export interface Config {
    /**
     * Approve every proposal the moment it is made.
     *
     * For non-interactive runs — demos, specs, CI. It is a **config row**, so it
     * is visible on the runtime graph and in a config diff, rather than an
     * environment variable nobody reads. Anything that turns a gate off should be
     * as legible as the gate.
     */
    readonly autoApprove?: boolean;
}
/** Thrown when work is attempted without a matching approval. */
export declare class PlanNotApprovedError extends Error {
    /** Stable machine-readable code. */
    readonly code: "PLAN_NOT_APPROVED";
    constructor(message: string);
}
/**
 * The approval gate.
 */
export declare class PlanGate extends Service {
    static readonly name = "plan-gate";
    static readonly Config: Schema<Config>;
    private readonly plans;
    private readonly autoApprove;
    constructor(ctx: Context, config?: Config);
    /** Replace a plan and announce the change. */
    private transition;
    /**
     * Digest a subject the way {@link propose} does.
     *
     * Exposed so an executor can compute the digest it must present to
     * {@link consume} without reconstructing the plan.
     * @param subject - the thing being approved.
     * @returns lowercase hex SHA-256.
     */
    static digest(subject: unknown): string;
    /**
     * Propose work.
     * @param proposal - what will happen, and to what.
     * @returns the plan, already approved when `autoApprove` is set.
     */
    propose(proposal: Proposal): Plan;
    /**
     * Look up a plan.
     * @param id - the plan id.
     * @returns the plan.
     * @throws when the id is unknown.
     */
    get(id: string): Plan;
    /** Every plan, newest first. */
    list(): Plan[];
    /**
     * Approve a pending plan.
     * @param id - the plan id.
     * @returns the approved plan.
     * @throws when the plan is not pending.
     */
    approve(id: string): Plan;
    /**
     * Reject a pending plan.
     * @param id - the plan id.
     * @param reason - why, for the record.
     * @returns the rejected plan.
     */
    reject(id: string, reason?: string): Plan;
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
    consume(id: string, digest: string): Plan;
}
export default PlanGate;
//# sourceMappingURL=index.d.ts.map