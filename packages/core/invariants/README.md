# @se373/invariants

Registry of package-owned **runtime** invariant checks.

Each package publishes an `./invariant` companion that registers checks under its
own package name. Selection is a regex allowlist/blocklist from config, so a
check can be disabled in production without deleting it. A violation throws
`InvariantError` carrying `code: 'INVARIANT'` and the owning `packageName`.

This pairs with seam conformance suites rather than duplicating them:

| | Runs | Catches |
|---|---|---|
| Conformance suite | once, before mount | a provider that does not satisfy its seam contract |
| Invariant companion | continuously, at runtime | a provider that satisfies the contract but drifts in operation |

## Depends on

| Package | Why |
|---|---|
| `@se373/cordis` | `Service`, `Context`, and `ctx.effect` for the reversible registration |
| `@se373/schemastery` | the config schema and its defaults |

Nothing else. Every package that contributes a check depends on *this*, not the
other way round, so the registry never grows a dependency on its contributors.

## In / out

| Boundary | Shape |
|---|---|
| config | `{ enabled?: boolean = true, allow?: string[] = [], deny?: string[] = [] }` |
| `allow` / `deny` | JavaScript regex **sources**, matched against the full package name; `allow` first, then `deny` |
| publishes | `ctx.invariants: InvariantRegistry` |
| `register(packageName, installer)` | → `() => void` disposer |
| `installer` | `(ctx: Context, fail: InvariantFailure) => void \| Promise<void>`, optionally carrying `.inject` |
| `fail(message)` | → `never`; throws `InvariantError` |
| `InvariantError` | `{ code: 'INVARIANT', packageName: string, message: string }` |

`code` is the contract; `message` is for humans. A model repairing its own block
reads the code.

**The installer runs in a child fiber the registry owns**, not in the caller's
context. Services it touches must be declared on the installer itself via
`.inject` — wrapping the caller in `ctx.inject` does not reach it.

A package name is reserved even when filtering disables its checks, so a
duplicate registration is still an error. Disposal releases the reservation.

## Usage

```ts
// packages/<group>/<pkg>/src/invariant.ts
import type { Context } from '@se373/cordis'

export default function (ctx: Context) {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/rerank', (ctx, fail) => {
      ctx.on('knowledge/reranked', (input, output) => {
        if (output.length !== input.length) fail('reranker dropped or invented hits')
      })
    })
  })
}
```

## Config

```yaml
- id: invariants
  name: '@se373/invariants'
  config:
    enabled: true
    deny:
      - '^@se373/vector-store$'   # noisy in production
```

## Known Limitations and Deferred Work

- Registration is keyed by package name, so one package cannot contribute two
  independently-disposable installers.
- Selection patterns are matched against the package name only; there is no
  per-check granularity within a package.
- Async installers are awaited at registration, so a slow check delays the
  registering fiber's activation.
