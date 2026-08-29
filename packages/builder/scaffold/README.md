# @se373/scaffold

## What it does

Namespaced directory writes that never collide and never escape. One mechanism,
two customers, by design: a fabricated agent's workspace-and-preset directory
(6d step 2) and an authored fork's package directory (6d step 3) are the same
act — write a named tree into a namespace the model may fill, under rules the
model cannot vary. Two implementations would drift on exactly the properties
that make the write safe.

Three rules, each carrying one failure mode:

- **A name is a single path segment** (upstream's preset-id pattern), because
  the name becomes a directory name and anything else could escape the root.
- **A scaffold never overwrites.** Forks-beside-originals and v2-beside-v1 are
  only true if writing over an existing name is structurally impossible.
- **Every tree path is checked against traversal** by resolving and comparing
  prefixes, not by pattern-matching — `..` is the obvious spelling and not the
  only one. Fork file lists become model-authored at 6d; `../` in a filename is
  an error, never an instruction.

Writes are all-or-nothing: paths validate before anything is created, and a
failure partway removes the directory. A half-written fork that later mounts is
the failure that prevents.

## Depends on

`node:fs`, `node:path`. Nothing else — everything in the builder plane will sit
on this, so it sits on nothing.

## In / out

| Export | Does |
|---|---|
| `writeScaffold(root, name, tree)` | write; returns the absolute directory. `tree` keys ending `/` make bare directories |
| `removeScaffold(root, name)` | remove; unknown names are a no-op |
| `listScaffolds(root)` | names present, sorted |
| `SCAFFOLD_NAME` | the name pattern |
| `ScaffoldError` | `SCAFFOLD_NAME \| SCAFFOLD_EXISTS \| SCAFFOLD_ESCAPE` |

## Known Limitations and Deferred Work

- **Not atomic against a crash.** All-or-nothing is enforced by cleanup on
  throw; a process killed mid-write leaves a partial directory that a later
  write refuses to replace. Removing it is manual.
- **No content limits.** Nothing bounds file count or size; the plan gate is
  where a model-requested write gets its budget, not here.
- **Text files only.** Content is written as UTF-8 strings; binary assets have
  no representation.
- **Symlinks are not defended against**: a tree path is checked lexically after
  resolve, but a pre-existing symlink inside a scaffold directory could not
  occur (the directory must not exist) — the gap is only reachable through the
  crash-leftover case above.
