/**
 * What a plan is, and what approving one means.
 *
 * @module @se373/plan-gate/types
 */

/** Where a plan is in its life. */
export type PlanStatus =
  /** Proposed, not yet decided. */
  | 'pending'
  /** A human said yes. Executable exactly once. */
  | 'approved'
  /** A human said no. Terminal. */
  | 'rejected'
  /** Executed. Terminal, and the reason approval is not a standing permission. */
  | 'consumed'

/** One step a plan will take, in order, phrased for a human. */
export interface PlanStep {
  /** Imperative, one line: "re-embed 343 chunks". */
  readonly summary: string
  /** Whether this step destroys or overwrites something. */
  readonly destructive: boolean
}

/** A proposal awaiting a decision. */
export interface Plan {
  /** Stable id. */
  readonly id: string
  /** What kind of work this is — `agent-fabrication`, `index-rebuild`. */
  readonly kind: string
  /** One line naming the outcome. */
  readonly summary: string
  /** The ordered steps. */
  readonly steps: readonly PlanStep[]
  /**
   * Digest of the exact work approved.
   *
   * The load-bearing field. Approval is not "yes, do something like this" — it
   * is "yes, do *this*", and without a digest the gap between the plan a human
   * read and the work that ran is unbounded. `consume` requires the executor to
   * present the same digest it proposed.
   */
  readonly digest: string
  /** Whatever the proposer wants to show; never interpreted here. */
  readonly detail: Readonly<Record<string, unknown>>
  /** Epoch milliseconds. */
  readonly createdAt: number
  /** Current status. */
  readonly status: PlanStatus
  /** Why it was rejected, when it was. */
  readonly reason?: string
}
