# @se373/block-registry

## What it does

`ctx.blocks`: a **repository** of named, versioned, provenance-carrying blocks —
not a catalog.

The distinction matters more than it sounds. A catalog is read-only and
populated at mount from whatever was vendored; a repository has a write path,
versions, parentage, and a namespace for entries that did not come from the
vendor. The deciding argument is provenance: the moment a block carries
`origin`, entries can come from somewhere other than the vendor, and a catalog
cannot express that. Retrofitting a write path into a catalog is a rewrite of
the registry; starting with a repository that happens to be full of
system-authored entries costs almost nothing.

**One registry, keyed by `kind`** (`agent | ui | pipeline | recipe`). Keeping it
single is what makes "compare two retrieval pipelines" and "compare two agents"
differ only in which blocks the rows name — the comparison machinery gets
written once.

**`origin` is a field, not a badge.** The inspector's badge is a projection of
it. What the field does is gate policy: `system` and `user` blocks mount
directly, and an `agent` block mounts only after passing its seam's conformance
suite (I7). That is the one place provenance does work rather than decorate.

**Forks are new ids in a separate namespace, never in-place edits.** The
original survives *by construction* rather than by policy — which is also why
you can still compare against it. You cannot compare against a version you
mutated away.

## Depends on

`@se373/home-paths` for the default persistence path, `@se373/runtime-graph` for
`contributeNode`, `@se373/cordis` and `@se373/schemastery`.

## In / out

**In — config.** `file`, where non-system blocks persist; defaults to
`$SE373_HOME/blocks/repository.json`.

**Out — `ctx.blocks`.**

| Method | Purpose |
|---|---|
| `register(input)` | write a version — appends, never replaces |
| `get(id)` / `at(id, version)` / `versions(id)` | read the newest, one specific, or the history |
| `list(query)` | newest version of each block, narrowed by kind/origin/seam/tier |
| `fork(id, changes)` | derive a new id, recording `forkedFrom` as `id@version` |
| `mountable(id)` | the origin policy verdict, and the rule behind it |

**Out — the record.** `id`, `kind`, `origin`, `version`, `forkedFrom?`,
`conformance?`, `manifest`, `createdAt`. The manifest is §6.1's: `summary`,
`seam?`, `provides?`, `role?`, `tier`, `indexInvalidating?`, `plugin?`,
`inject?`, `requires?`, `defaults?`.

`seam` and `provides` are separate on purpose. A seam is a *contract with
alternatives* — what a builder isolates so two fabrications do not collide in the
root realm. `provides` is simply what appears on `ctx`, including core services
that have no alternatives and therefore no seam.

**Out — events.** `blocks/registered`.

Only non-system blocks persist. System blocks are re-registered by their own
rows at every boot, so persisting them would create a second, staler source for
something the config already decides.

## Known Limitations and Deferred Work

- **Persistence is a whole-file rewrite on every mutation.** Every resolved spec
  is an `origin: 'agent'` block, so planning writes the file. Fine at this size,
  wrong at any other.
- **No deletion.** Nothing removes a block or a version, so a repository only
  grows — including every spec ever planned and never fabricated.
- **`mountable` never returns allowed for an agent block.** It reports what
  would be required; running the suite is phase 6d, and until then the verdict
  is a refusal with a reason rather than a gate that can open.
- **Manifests are not validated.** `register` takes whatever it is given, so a
  manifest naming a plugin that does not exist is stored happily and fails at
  fabrication.
- **Ids are opaque strings.** Nothing enforces the `block.` / `recipe.` /
  `spec.` prefixes the rest of the system reads, and nothing prevents a fork
  landing in another namespace's prefix.
