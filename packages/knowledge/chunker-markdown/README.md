# @se373/chunker-markdown

## What it does

Fills `ctx.chunker` for Markdown: splits at headings first, recursively within.

The reason to prefer it for a Markdown corpus is not tidiness — it is that
**the heading travels with the chunk**. A span reading "it is computed, never
declared" is close to useless on its own and highly retrievable once it carries
`The generation key is a fingerprint, not a flag`, which is also what makes the
retrieved context legible to a model reading it.

Three behaviours, each fixing something that was observed rather than
anticipated:

- **Fenced code is tracked**, so a `#` comment inside a shell block is not
  mistaken for a heading. `docs/` here is full of them, and without this a
  document is cut apart at every commented command.
- **Sections shorter than `minSize` are merged forward** into the next one,
  because documentation is full of two-line sections whose own text says
  nothing. A trailing short section is kept regardless — dropping it would
  silently lose the end of every document that ends in one.
- **The heading is prepended to each span after splitting, not before.**
  Prepending first and splitting after has two failures, and the first is
  silent: a long section can emit a span consisting of the heading *alone* —
  maximum title signal, zero information — which then attracts every query whose
  words resemble that heading. The second is that only the first span kept the
  heading at all, so the rest of a long section lost the very signal this
  chunker exists to preserve.

## Depends on

Identical to `@se373/chunker-recursive`: `@se373/chunker`, `@se373/corpus`,
`@se373/digest`, `@se373/cordis`, `@se373/schemastery`. No Markdown parser — the
sectioning is a line scan with fence tracking, because all it needs to find is
ATX headings.

## In / out

**In — config.**

| Field | Default | Meaning |
|---|---|---|
| `size` | `900` | target characters per chunk, before the heading is prepended |
| `overlap` | `120` | characters repeated between adjacent spans of one section |
| `minSize` | `200` | sections shorter than this merge into the following one |

**Out.** `ctx.chunker`, plus `sections(text)` exported for its spec. Each chunk's
`title` is its section heading (falling back to the document's), and
`metadata.heading` records it separately.

## Known Limitations and Deferred Work

- **ATX headings only.** Setext headings (`Title` underlined with `===`) are not
  recognised, so a document using them is one section.
- **Heading depth is ignored.** `#` and `######` are equal boundaries, so a
  deeply nested document fragments more than it should and no chunk carries its
  ancestor headings — only its own.
- **Front matter is body text.** A YAML block at the top of a file is chunked
  along with the prose.
- **Prepending the heading pushes chunks past `size`.** The target applies to
  the body; the stored text is that plus the heading.
- **No table or code-block awareness beyond fences.** A long table is split like
  prose, and every span after the first loses the header row.
