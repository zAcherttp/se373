# @se373/hello

## What it does

The phase-1 proof plugin. It exists to demonstrate, in the smallest surface
possible, the five things phase 1 had to establish:

1. the loader mounts a plugin from a config row
2. a fiber owns it
3. config arrives validated, with defaults
4. a service publishes onto the context
5. **teardown unwinds** — every registration is a reversible effect (I6)

Point 5 is the one worth the package. The service holds a timer and logs when
that timer is cleared, so disposal is audible rather than assumed.

**Delete this package** once a real service occupies the same ground.

## Depends on

| Package | Why |
|---|---|
| `@se373/cordis` | `Service`, `Context` |
| `@se373/schemastery` | the config schema and its defaults |
| `@se373/invariants` | only in `./invariant`, not in the main entry |

The split is the convention every package follows: the ordinary entrypoint
stays free of diagnostics, and the runtime check ships as a separate export.

## In / out

| Boundary | Shape |
|---|---|
| config | `{ greeting?: string = 'se373', tickMs?: number = 0 }` |
| publishes | `ctx.hello: HelloService` |
| `ctx.hello.greet(name)` | → `string` |
| `ctx.hello.ticks` | `number` — ticks since activation; read by the invariant |
| on activation | logs `hello, <greeting>`; starts the interval when `tickMs > 0` |
| on disposal | clears the interval, logs `hello disposed after N tick(s)` |

`tickMs: 0` means no timer, so the package is inert by default.

### The `./invariant` companion

```yaml
- id: hello-invariant
  name: '@se373/hello/invariant'
```

The installer runs in a child fiber **the registry owns**, not in the caller's
context. Services it touches must be declared on the installer itself:

```ts
const check = Object.assign(
  (ctx, fail) => { if (ctx.hello.ticks < 0) fail('tick counter went negative') },
  { inject: ['hello'] },
)
```

Wrapping the caller in `ctx.inject` is not enough — that was a real bug during
phase 1.

## Known Limitations and Deferred Work

- The invariant is trivial by design; it demonstrates wiring, not a real
  contract.
- No tests. The package's whole behaviour is observable in the phase-1 boot
  output, and it is scheduled for deletion.
