/**
 * The gate is one object standing between a model and everything irreversible,
 * and every way it can fail is quiet.
 *
 * **A consume that ignores the digest** turns approval from "yes, do this" into
 * "yes, do something like this", and the distance between the plan a human read
 * and the work that ran becomes unbounded. The approval genuinely exists; only
 * the subject moved. Nothing errors.
 *
 * **A consume that can happen twice** turns one approval into a standing
 * permission. The first run is the one somebody watched.
 *
 * **An approval that survives rejection** is the same failure wearing a
 * different status.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { PlanGate, PlanNotApprovedError } from '../src/index.ts'

/** A gate on a bare context. */
function gate(autoApprove = false): PlanGate {
  return new PlanGate(new Context() as never, { autoApprove })
}

/** A proposal over the given subject. */
function proposal(subject: unknown) {
  return {
    kind: 'test',
    summary: 'do the thing',
    steps: [{ summary: 'the thing', destructive: true }],
    subject,
  }
}

describe('digest binding', () => {
  it('refuses work whose digest is not the one approved', () => {
    const g = gate()
    const plan = g.propose(proposal({ rows: ['a', 'b'] }))
    g.approve(plan.id)
    // Same plan, different work. This is the failure the digest exists for:
    // the approval is real and the subject changed underneath it.
    expect(() => g.consume(plan.id, PlanGate.digest({ rows: ['a', 'b', 'c'] })))
      .toThrow(PlanNotApprovedError)
  })

  it('accepts work whose digest matches', () => {
    const g = gate()
    const subject = { rows: ['a', 'b'] }
    const plan = g.propose(proposal(subject))
    g.approve(plan.id)
    expect(g.consume(plan.id, PlanGate.digest(subject)).status).toBe('consumed')
  })

  it('digests by value, not by identity or key order', () => {
    // Two structurally identical specs assembled differently must be the same
    // approval; otherwise re-deriving a spec invalidates a fresh approval and
    // people learn to approve twice without reading.
    expect(PlanGate.digest({ a: 1, b: [2, 3] })).toBe(PlanGate.digest({ b: [2, 3], a: 1 }))
  })
})

describe('single use', () => {
  it('cannot be consumed twice', () => {
    const g = gate()
    const subject = { k: 1 }
    const plan = g.propose(proposal(subject))
    g.approve(plan.id)
    g.consume(plan.id, PlanGate.digest(subject))
    // One approval is not a standing permission: the second run is the one
    // nobody watched.
    expect(() => g.consume(plan.id, PlanGate.digest(subject))).toThrow(/consumed/)
  })

  it('refuses a pending plan', () => {
    const g = gate()
    const subject = { k: 1 }
    const plan = g.propose(proposal(subject))
    expect(() => g.consume(plan.id, PlanGate.digest(subject))).toThrow(/pending/)
  })

  it('refuses a rejected plan', () => {
    const g = gate()
    const subject = { k: 1 }
    const plan = g.propose(proposal(subject))
    g.reject(plan.id, 'no')
    expect(() => g.consume(plan.id, PlanGate.digest(subject))).toThrow(/rejected/)
    expect(g.get(plan.id).reason).toBe('no')
  })

  it('refuses to approve anything that is not pending', () => {
    const g = gate()
    const plan = g.propose(proposal({}))
    g.reject(plan.id)
    expect(() => g.approve(plan.id)).toThrow(PlanNotApprovedError)
  })
})

describe('autoApprove', () => {
  it('approves on proposal, and still binds the digest', () => {
    // The escape hatch for non-interactive runs. It must skip the *decision*,
    // never the binding -- otherwise turning it on silently removes the check
    // that catches a spec changing between proposal and execution.
    const g = gate(true)
    const subject = { k: 1 }
    const plan = g.propose(proposal(subject))
    expect(plan.status).toBe('approved')
    expect(() => g.consume(plan.id, PlanGate.digest({ k: 2 }))).toThrow(PlanNotApprovedError)
    expect(g.consume(plan.id, PlanGate.digest(subject)).status).toBe('consumed')
  })
})

describe('unknown plans', () => {
  it('refuses an id it never issued', () => {
    expect(() => gate().consume('not-a-plan', 'x')).toThrow(PlanNotApprovedError)
  })
})
