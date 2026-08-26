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
