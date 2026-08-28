# @se373/board-gateway

## What it does

Carries `ctx.runtimeGraph` across the network boundary, so a browser can read
the runtime the host is running.

That is the whole package: one `TypertRemoteService` with one `@Remote` method.
It exists separately from the projection for the reason the `graph_inspect` tool
does — the projection is infrastructure every consumer needs, and **publishing
it is a deployment choice**. Invariant I3 says a deployment choice is a config
row you can disable, not an import you have to delete.

Here that is more than tidiness. A node carries its **resolved config**, which
is the payload's whole point at the board and also the reason this must never
become a plain route on the webserver: `/api` sits behind the browser-trust
fence, and an unauthenticated route beside it would publish every row's
configuration to anything that can reach the port.

The snapshot is unnarrowed. `ctx.runtimeGraph.snapshot()` offers narrowing so a
*model* need not read 190 rows into its context; a board has no such budget
problem, and filtering in the browser keeps a filter change from being a round
trip.

## Depends on

| | Why |
|---|---|
| `ctx.runtimeGraph` (injected) | the projection. This package owns no runtime knowledge of its own |
| `@se373/typert-protocol` | `TypertRemoteService` and the `@Remote` decorator the generator reflects |
| `zod` | imported at runtime by the generated `./typert` and `./remote` artifacts |
| `@se373/invariants` (peer, `./invariant` only) | checks the wire agrees with the projection |

## In / out

**Config in** — none.

**Service out** — `ctx.board`, whose only member is `snapshot()`.

**Generated out** — `./typert` (the host descriptor) and `./remote` (the client
codec), both written by `scripts/typert-generate.mts` into `lib/`. Neither has
source; `pnpm build:vendor` is what puts them on disk.

**Wire shape** — `BoardSnapshot` in `./types`: structurally
`RuntimeGraphSnapshot`, restated in mutable, unbranded form because the analyzer
reflects these declarations into a codec and cannot construct a `readonly`
array on the far side. The projection stays the single source of the *meaning*;
this is its wire cast, and the invariant is what keeps the two honest.

## Known Limitations and Deferred Work

- **Poll-only.** One method, one snapshot. There is no subscription, which is
  decision D9 and still open — node transitions travel with the payload, so a
  polling consumer recovers the history it slept through, which makes the
  question latency rather than loss.
- **The wire shape is a hand-kept copy.** A field added to `RuntimeGraphNode`
  does not appear here until someone adds it, and the invariant compares row
  *identity*, not fields — it would catch a dropped row, not a dropped column.
- **Anyone through the fence sees every row's resolved config.** That is the
  point of the board and a real exposure: the fence is the only thing between a
  `!!js` config value and a browser. Disable the row for a deployment where that
  is not an acceptable trade.
- **No mutation.** Nothing here enables, disables, or reloads a component; that
  is a property of the projection beneath it.
