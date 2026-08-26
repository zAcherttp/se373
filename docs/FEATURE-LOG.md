# Feature Log

**Append-only.** Add entries at the bottom; never edit or delete an entry above.
A past entry describes what was true at that commit — correcting it destroys the
record. If something turns out wrong, write a new entry that says so.

## Why this file exists

Three jobs, and it is the only file that does all three:

1. **What actually shipped**, as opposed to what is planned. The architecture
   doc describes an intended system; this describes the built one.
2. **Roadmap alignment.** Each entry names the SE373 topic area it serves (the
   eight in [COURSE.md](COURSE.md)), so a phase that covers no topic is visible
   before the demo rather than after it.
3. **Rewind.** Every entry carries a git tag. To show a feature the way it was
   when it worked, check out the tag.

```bash
git tag -l                  # every demonstrable point
git checkout phase-1        # rewind to that feature, working
git checkout main           # come back
```

## Entry format

Copy this block. Keep it short — the commit message carries detail.

```markdown
## <tag> — <title>

**Date** · **Commit** `<sha>` · **Tag** `<tag>`

**Roadmap** — <SE373 topic area(s) from COURSE.md, or "infrastructure">
**Phase** — <§13 phase number and name>

**Demonstrable**
<one paragraph: what a person can see working, and the exact command>

**Packages**
| Package | What it does |
|---|---|

**Not yet**
<what this deliberately does not do, so the next entry is not a surprise>
```

## Rules

- **One entry per tag, one tag per demonstrable feature.** A phase that ends
  with nothing runnable does not get an entry — that is the point of the log.
- **Tag before writing the entry**, so the sha is real.
- **The `Demonstrable` command must actually run** on a fresh clone at that tag.
  If it needs a build step first, say so in the entry.
- **`Not yet` is required.** An entry without it reads as a completeness claim.

---

## phase-1 — Boot a plugin tree, and prove it unwinds

**2026-08-26** · **Commit** `eebab0b` · **Tag** `phase-1`

**Roadmap** — Infrastructure, plus the first third of topic 8
(*Observability*): the logger channel and the invariants registry are both
standing. Serves no other topic directly; every later one stands on it.
**Phase** — §13 phase 1, "Cordis boot".

**Demonstrable**

A CLI boots a plugin tree from a config file, a service publishes onto the
context, and interrupting the process unloads the tree with its disposal
visible. That last part is the actual claim: invariant I6 says every
registration is a reversible effect, and this shows the effect running.

```bash
pnpm install && npx tsc -b tsconfig.vendor.json && pnpm se373
```

```
[I] hello-service  hello, se373
[I] root           booted examples/hello/cordis.yml
[D] hello-service  tick 1
[I] root           unloading on SIGINT
[I] hello-service  hello disposed after 3 tick(s)
[I] root           unloaded
```

**Packages**

| Package | What it does |
|---|---|
| `vendor/*` (9) | The Cordis framework, source-vendored and rescoped. See [PORTING.md](PORTING.md). |
| `@se373/invariants` | Registry of package-owned runtime checks; every later package's `./invariant` companion registers here. |
| `@se373/hello` | Proof plugin. A service, a config row, and a timer whose disposal is audible. |
| `@se373/cli` | Boots a config tree; resolves plugin names relative to the config, not the cwd. |

**Not yet**

No LLM, no session log, no tools, no UI — nothing above L0. `@se373/hello` is
a demo and gets deleted when a real service takes that ground. The console
exporter is mounted by the CLI rather than configured as a row, so per-package
log levels (§11.2) are not yet a config edit.
