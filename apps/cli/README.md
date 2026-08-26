# @se373/cli

## What it does

Boots a plugin tree from a config file and holds it open until interrupted.
Everything interesting is a config row, not code in this package — the only real
logic here is shutdown.

Two decisions live in this package because nothing else can make them:

**The console exporter is mounted on the root context, not as a tree row.**
Cordis's logger writes only to registered exporters, so a tree-owned exporter is
absent before the tree mounts, absent after it unloads, and racy during mount
(a group starts its rows concurrently). Mounting it on the root covers the whole
process lifetime, disposal included.

**Plugin names resolve relative to the config file, not the process cwd.**
A tree declares what it needs, and Node's resolution walks up from where the
config lives. Booting the same file from anywhere behaves identically.

## Depends on

| Package | Why |
|---|---|
| `@se373/cordis` | the root `Context` |
| `@se373/cordis-plugin-loader` | turns rows into mounted plugins |
| `@se373/cordis-plugin-logger-console` | the process-lifetime exporter |
| `@se373/cordis-plugin-include` | mounted *by name* to read the config file |

`include` is imported by specifier at runtime, not by static import, so it must
resolve from the config's directory — see `examples/package.json`.

## In / out

| Boundary | Shape |
|---|---|
| argv | `se373 [path]` or `se373 --config <path>`; defaults to `examples/hello/cordis.yml` |
| config file | a row list — `{ id, name, config? }[]` — read by `plugin-include` |
| stdout/stderr | log lines from every package's namespaced logger |
| `SIGINT` / `SIGTERM` | unloads the tree, **awaits** it, then exits 0 |

Awaiting the unload is deliberate: a row that leaked a handle makes the process
hang here, rather than exiting cleanly and pretending nothing is wrong.

## Run

```bash
pnpm se373                              # the phase-1 example
pnpm se373 examples/hello/cordis.yml    # explicit
```

## Known Limitations and Deferred Work

- No `--log-level` flag; the exporter is mounted with `{ default: 3 }`
  hard-coded. Per-package levels (§11.2) belong in a config row once there is a
  settings plane to carry them.
- No profile or bundle layering. dsh's `boot/app-boot` does `.env` loading,
  fail-loud loader guards, and snapshot-aware config resolution; none of that is
  here.
- Shutdown exits on the first signal and ignores repeats. There is no forced
  exit if disposal never settles — that hang is the diagnostic.
