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

import { Context, Service } from '@se373/cordis'
import { randomUUID } from 'node:crypto'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { canonicalDigest } from '@se373/digest'
import type { Plan, PlanStep } from './types.ts'

export * from './types.ts'

declare module '@se373/cordis' {
  interface Context {
    planGate: PlanGate
  }

  interface Events {
    /**
     * A plan was proposed and is awaiting a decision.
     * @param plan - the proposal.
     * @mode emit
     */
    'plan/proposed'(plan: Plan): void
    /**
     * A plan was approved, rejected or consumed.
     * @param plan - the plan in its new status.
     * @mode emit
     */
    'plan/decided'(plan: Plan): void
  }
}

/** What a proposer supplies. */
export interface Proposal {
  /** Work class — `agent-fabrication`, `index-rebuild`. */
  readonly kind: string
  /** One line naming the outcome. */
  readonly summary: string
  /** The ordered steps, phrased for a human. */
  readonly steps: readonly PlanStep[]
  /**
   * The thing being approved, in whatever shape the proposer uses.
   *
   * Digested, never stored raw, so the gate can bind an approval to it without
   * understanding it.
   */
  readonly subject: unknown
  /** Anything worth showing alongside; not digested. */
  readonly detail?: Readonly<Record<string, unknown>>
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
  readonly autoApprove?: boolean
}

/** Thrown when work is attempted without a matching approval. */
export class PlanNotApprovedError extends Error {
  /** Stable machine-readable code. */
  readonly code = 'PLAN_NOT_APPROVED' as const

  constructor(message: string) {
    super(message)
    this.name = 'PlanNotApprovedError'
  }
}

/**
 * The approval gate.
 */
export class PlanGate extends Service {
  static override readonly name = 'plan-gate'

  static readonly Config: Schema<Config> = z.object({
    autoApprove: z.boolean().default(false),
  }) as Schema<Config>

  private readonly plans = new Map<string, Plan>()
  private readonly autoApprove: boolean

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'planGate')
    this.autoApprove = config.autoApprove ?? false
  }

  /** Replace a plan and announce the change. */
  private transition(plan: Plan, next: Partial<Plan>): Plan {
    const updated = { ...plan, ...next } as Plan
    this.plans.set(plan.id, updated)
    this.ctx.emit('plan/decided', updated)
    return updated
  }

  /**
   * Digest a subject the way {@link propose} does.
   *
   * Exposed so an executor can compute the digest it must present to
   * {@link consume} without reconstructing the plan.
   * @param subject - the thing being approved.
   * @returns lowercase hex SHA-256.
   */
  static digest(subject: unknown): string {
    return canonicalDigest(subject)
  }

  /**
   * Propose work.
   * @param proposal - what will happen, and to what.
   * @returns the plan, already approved when `autoApprove` is set.
   */
  propose(proposal: Proposal): Plan {
    const plan: Plan = {
      id: randomUUID(),
      kind: proposal.kind,
      summary: proposal.summary,
      steps: [...proposal.steps],
      digest: PlanGate.digest(proposal.subject),
      detail: proposal.detail ?? {},
      createdAt: Date.now(),
      status: 'pending',
    }
    this.plans.set(plan.id, plan)
    this.ctx.emit('plan/proposed', plan)
    return this.autoApprove ? this.approve(plan.id) : plan
  }

  /**
   * Look up a plan.
   * @param id - the plan id.
   * @returns the plan.
   * @throws when the id is unknown.
   */
  get(id: string): Plan {
    const plan = this.plans.get(id)
    if (plan === undefined) throw new PlanNotApprovedError(`no plan ${id}`)
    return plan
  }

  /** Every plan, newest first. */
  list(): Plan[] {
    return [...this.plans.values()].sort((left, right) => right.createdAt - left.createdAt)
  }

  /**
   * Approve a pending plan.
   * @param id - the plan id.
   * @returns the approved plan.
   * @throws when the plan is not pending.
   */
  approve(id: string): Plan {
    const plan = this.get(id)
    if (plan.status !== 'pending') {
      throw new PlanNotApprovedError(`plan ${id} is ${plan.status}, not pending`)
    }
    return this.transition(plan, { status: 'approved' })
  }

  /**
   * Reject a pending plan.
   * @param id - the plan id.
   * @param reason - why, for the record.
   * @returns the rejected plan.
   */
  reject(id: string, reason?: string): Plan {
    const plan = this.get(id)
    if (plan.status !== 'pending') {
      throw new PlanNotApprovedError(`plan ${id} is ${plan.status}, not pending`)
    }
    return this.transition(plan, { status: 'rejected', ...reason === undefined ? {} : { reason } })
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
  consume(id: string, digest: string): Plan {
    const plan = this.get(id)
    if (plan.status !== 'approved') {
      throw new PlanNotApprovedError(
        `plan ${id} is ${plan.status}; work may only run against an approved plan`,
      )
    }
    if (plan.digest !== digest) {
      throw new PlanNotApprovedError(
        `plan ${id} was approved for ${plan.digest.slice(0, 12)}… but the work presented `
        + `${digest.slice(0, 12)}…. What was approved is not what is about to run.`,
      )
    }
    return this.transition(plan, { status: 'consumed' })
  }
}

export default PlanGate
