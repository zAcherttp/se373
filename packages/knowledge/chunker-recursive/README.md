# @se373/chunker-recursive

## What it does

Fills `ctx.chunker` by recursive character splitting: tries progressively finer
separators — paragraph, line, sentence, clause, word — merges the pieces greedily
up to a target size, and repeats a tail of each chunk at the head of the next so
a span that straddles a boundary stays retrievable from both sides.

It knows nothing about the document's format, which is exactly why it is the
format-agnostic default: a corpus of mixed prose, code and configuration has no
structure a format-aware splitter could agree on, and guessing wrong costs more
than not guessing.

## Depends on

`@se373/chunker` (the abstract base, `splitRecursive`, `buildChunk`,
`DEFAULT_SEPARATORS`), `@se373/corpus` for `Document`, `@se373/digest` for
`chunkerRef`, plus `@se373/cordis` and `@se373/schemastery`.

## In / out

**In — config.**

| Field | Default | Meaning |
|---|---|---|
| `size` | `900` | target characters per chunk |
| `overlap` | `120` | characters repeated between adjacent chunks |
| `separators` | the default ladder | tried in order, coarsest first |

`overlap` must be smaller than `size`; the constructor throws otherwise, because
the alternative is a merge loop that never advances.

**Out.** `ctx.chunker`. `chunkerRef` digests the provider name, `size`, `overlap`
and the separator list — the last of those **unsorted**, because the ladder is
tried in sequence and two orderings are two chunkers.

## Known Limitations and Deferred Work

- **Nothing carries structure.** Chunks have no title beyond the document's own,
  so a passage retrieved from the middle of a long document arrives without the
  heading it sat under. That is the whole reason `chunker-markdown` exists, and
  it is the right default only for corpora that have no headings.
- **Separators are literal strings, not patterns.** `'. '` misses a sentence
  ending at a newline, and misfires on `e.g. ` and on `1. ` in a numbered list.
- **No language awareness.** The ladder is Latin-script punctuation; a corpus in
  Chinese or Thai falls through to the space separator and then to hard windows.
- **Overlap is not deduplicated at retrieval.** Adjacent chunks genuinely share
  text, so both can match one query — which is what `@se373/knowledge-dedup`
  exists to cap.
