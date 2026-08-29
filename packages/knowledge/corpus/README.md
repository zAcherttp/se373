# @se373/corpus

## What it does

Defines where documents come from: the seam `ctx.corpusSources`, the `Document`
shape, and the content hash that makes incremental re-ingest possible.

It is **stage 0 of the write path**, which gives it the widest blast radius in
the plane — §5.5's cascade is positional, so a change here re-crawls, re-chunks,
re-embeds and rewrites the store. `sourceRef` is what makes that detectable.

Two decisions are worth stating because both are about *not trusting the
source*:

- **`contentHash` is over the document's bytes**, never over anything the source
  declares. Mtimes lie, caches lie, and a touched-but-identical file lies. Being
  wrong here means re-embedding work that did not need it (slow, visible) or
  skipping work that did (silently stale, invisible) — and only the second one
  matters.
- **`id` must be stable**, because chunk keys derive from it. A document whose id
  changes between crawls is *added* rather than updated, leaving its old chunks
  orphaned in the index. A source-relative path is stable; an absolute path moves
  with the checkout.

## Depends on

`@se373/cordis`, for `Service` and the `Context` merge. Nothing else.

## In / out

**Out — the seam.** `ctx.corpusSources: CorpusSource`, an abstract `Service`
subclass. As with the other seams there is no plugin row for it: `ctx.provide`
claims ownership of a name, so a declaring row would collide with the first real
provider.

| Member | Purpose |
|---|---|
| `sourceRef` | digest of the provider and its resolved config — stage 0 of the generation key |
| `describe()` | one line a human reads before approving a rebuild |
| `documents()` | `AsyncIterable<Document>` |

`documents()` streams because a corpus is the one stage whose size is neither
known in advance nor bounded by anything we control.

**Out — the value.** `Document`: `id`, `text`, `title`, `contentHash`,
`metadata`.

The key is plural (`corpusSources`) because a single provider may be pointed at
several roots, not because several providers coexist.

## Known Limitations and Deferred Work

- **One provider ships** (`corpus-fs`). `corpus-git` and `corpus-http` are named
  in the architecture and do not exist, so nothing has yet tested the seam
  against a source with real latency or pagination.
- **No incremental crawl protocol.** `documents()` yields everything every time;
  skipping unchanged documents happens downstream, in the pipeline, after the
  file has already been read. A source that could answer "what changed since X"
  has no way to say so.
- **Text only.** `Document.text` is a string, so binary and non-UTF-8 sources
  have no representation. Attachments, images and PDFs are out of scope.
- **No ordering guarantee in the contract.** `corpus-fs` sorts, because a
  reproducible ingest log is worth having, but nothing in the seam requires it.
