# @se373/corpus-fs

## What it does

Fills `ctx.corpusSources` from a directory tree. Walks a list of roots, keeps
files matching a suffix list, and yields one document per file with a
source-relative id and a hash of its bytes.

Most of the design is in what `sourceRef` covers and what it does not.

**Roots are resolved and de-duplicated and sorted before being digested.** The
same three directories listed in a different order, or written relatively from a
different working directory, are the same corpus. A rebuild that fired because
somebody reordered a YAML list would teach people to distrust the mechanism —
and the cost of that mistake is a full re-embed of the whole corpus.

**The digest covers the selection rules, not the files.** Which files exist is
what a *crawl* discovers; `sourceRef` answers whether the crawl would look in
the same places. Hashing the file list would make every edit to every document a
stage-0 change, cascading into a full re-crawl — exactly what the positional
cascade exists to avoid.

## Depends on

| | |
|---|---|
| `@se373/corpus` | the abstract `CorpusSource` base and the `Document` shape |
| `@se373/digest` | `stageDigest` for `sourceRef`, `contentDigest` for each document |
| `@se373/cordis`, `@se373/schemastery` | service and config |
| `node:fs/promises` | `readdir`, `readFile`, `stat` |

## In / out

**In — config.**

| Field | Default | Meaning |
|---|---|---|
| `roots` | `['.']` | directories to walk; relative paths resolve against the process cwd |
| `extensions` | `['.md', '.txt']` | file suffixes to keep, with the leading dot |
| `maxBytes` | `1_000_000` | larger files are skipped |

**Out.** `ctx.corpusSources`. Each `Document` carries:

| Field | Value |
|---|---|
| `id` | `<root basename>/<path relative to that root>`, forward slashes |
| `title` | the document's **leading** Markdown heading, or `null` |
| `contentHash` | SHA-256 of the file's text |
| `metadata` | `{ path, root, bytes }` |

Dotfiles and dot-directories are skipped, as are `node_modules`, `.git`, `lib`,
`dist`, `coverage` and `.turbo`. Empty and whitespace-only files are skipped
rather than indexed. Directory entries are visited in sorted order so two crawls
of an unchanged tree produce the same log.

Only a *leading* heading becomes the title: a heading found anywhere would pick
up the first section of a file whose real title is elsewhere, and a wrong title
travels into every chunk.

## Known Limitations and Deferred Work

- **The skip list is hardcoded.** No `.gitignore` support, no configurable
  ignore globs. A repository with a large generated directory not on the list
  indexes it.
- **No symlink handling.** `readdir` entries that are symlinks are neither
  followed nor explicitly skipped, so behaviour depends on the platform, and a
  symlink loop is not guarded against.
- **Everything is read into memory one file at a time.** `maxBytes` bounds a
  single file; nothing bounds the crawl.
- **`extensions` is a suffix match, not a content sniff.** A `.md` file
  containing binary is yielded as text.
- **Unreadable files are skipped silently.** A permissions error looks exactly
  like a file that does not match — nothing is logged and nothing is counted.
