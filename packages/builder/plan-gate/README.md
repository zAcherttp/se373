# @se373/plan-gate

## What it does

Stands between a model and everything irreversible. Nothing destructive runs
until a human approved **this specific work**.

Invariant I8 says building is plan-gated; §5.5 says a destructive index change
is gated the same way. Both wanted the same object, so there is one: a proposal
carrying a digest, a decision, and a single-use consumption.

Three properties, and the middle one is the one usually missing:

- **Approval is per-plan, not per-session.** A consumed plan is terminal.
  Approving a rebuild does not authorise the next one, and an agent that wants
  to act twice asks twice.
- **Approval binds to a digest.** Without one, "approve" means "yes, do
  something like this", and the distance between the plan a human read and the
  work that ran is unbounded — which is exactly the hole a plan card is supposed
  to close. `consume` requires the executor to present the digest it proposed, so
  a spec that changed between proposal and execution cannot run under the old
  approval.
- **It is a mounted policy row, not a law.** With no `plan-gate` row there is no
  gate, exactly as with no `tool-fs` row there is no filesystem tool (I3). The
  architecture is explicit that plan mode is soft guidance and that sandbox mode
  and approval policy are the real restrictions; this is the same, said out loud.

## Depends on

`@se373/digest` for the subject digest, `@se373/cordis` and
`@se373/schemastery`. No persistence, no UI, no knowledge of what it is gating.

## In / out

**In — config.** `autoApprove` (default `false`) approves every proposal as it
is made, for non-interactive runs. It is a config row rather than an environment
variable so that turning a gate off is as legible as the gate. It skips the
*decision* and never the *binding*: a digest mismatch still refuses.

**Out — `ctx.planGate`.**

| Method | Purpose |
|---|---|
| `propose(proposal)` | digest the subject, record the plan, emit `plan/proposed` |
| `approve(id)` / `reject(id, reason?)` | decide a pending plan |
| `consume(id, digest)` | spend an approval on exactly the work it was given for |
| `get(id)` / `list()` | read plans |
| `PlanGate.digest(subject)` | the digest an executor must present |

**Out — events.** `plan/proposed` and `plan/decided`.

A `Plan` carries `kind`, `summary`, ordered `steps` (each flagged `destructive`),
the `digest`, free-form `detail`, and a `status` of
`pending | approved | rejected | consumed`.

## Known Limitations and Deferred Work

- **Plans live in memory.** A restart forgets every pending and approved plan.
  For a gate whose approvals are single-use and short-lived that is defensible;
  for an audit trail it is not, and there is no durable record of what was
  approved or by whom.
- **No identity.** Nothing records *who* approved. `approve(id)` is available to
  anything holding the service, so the gate proves that a decision point was
  reached, not that a particular person made it.
- **Not a security control.** Anything with the context can call `approve`. It
  structures a workflow; sandbox mode and approval policy are what restrict.
- **No expiry.** An approved plan stays approved indefinitely until consumed.
- **Steps are prose.** `destructive` is a boolean a proposer sets, and nothing
  derives or checks it — a proposer that mislabels a step produces a plan card
  that reads as safe.
