# @se373/chunker

## What it does

Defines how a document becomes indexable spans: the seam `ctx.chunker`, the
`Chunk` shape, one key scheme, and the recursive splitter both providers share.

**Stage 1 of the write path.** A change here re-chunks, re-embeds and rewrites,
but does *not* re-crawl.

Three things live here rather than in a provider, each because a provider
disagreeing about it would be a silent bug:

- **The key scheme** (`<documentId>#<index>`), so the store can upsert. A
  provider that invented its own would work until somebody swapped providers on
  an existing index, at which point every chunk is an insert rather than an
  update and the old ones linger.
- **`documentHash` on every chunk** — the *document's* hash, not the chunk's.
  Incremental re-ingest asks "has this document changed", and the answer has to
  be readable from the index without re-chunking to find out.
- **The recursive splitter**, because `chunker-markdown` needs exactly the same
  behaviour for sections too long to stand alone, and one provider importing
  another would make its output depend on a package a config row can disable.

## Depends on

`@se373/corpus` for `Document`, `@se373/cordis` for `Service`. Nothing else —
no tokenizer, deliberately (see below).

## In / out

**Out — the seam.** `ctx.chunker: Chunker`, an abstract `Service` subclass with
`chunkerRef`, `describe()` and `chunk(document): Chunk[]`.

Synchronous on purpose. Chunking is text manipulation over a document already in
memory; an async signature would invite a provider that calls a model to decide
boundaries, which would put a network dependency in front of the *cheap* stage
and make the cascade's cost model wrong.

**Out — the splitter.** `splitRecursive(text, { size, overlap, separators })`
and `DEFAULT_SEPARATORS` (`'\n\n'`, `'\n'`, `'. '`, `', '`, `' '`). Tries
separators coarsest-first, recurses into oversized pieces, and falls back to
fixed windows when no separator is left — that last case matters because an
oversized chunk is silently truncated at embed time and its tail is never
indexed at all.

**Out — `buildChunk(document, index, text, extra?, title?)`**, the one place
keys and hashes are derived.

**Sizes are in characters, not tokens.** A token-aware splitter would have to
reach the tokenizer, which belongs to the embedder, which comes *after* the
chunker in the cascade — so it would invalidate itself whenever the model
changed, forcing a re-chunk the positional rule says is unnecessary. Overshooting
the model's token budget is handled by truncation at embed time.

## Known Limitations and Deferred Work

- **Character sizing overshoots unevenly across languages.** A 900-character
  chunk is far more tokens in Vietnamese or Chinese than in English, so the
  effective chunk size varies with the corpus and the tail is silently truncated
  at embed time. Nothing warns.
- **`size` is a target, not a cap.** A single unsplittable run below the
  hard-window fallback can exceed it.
- **Overlap is character-based**, so it can cut mid-word; only the word-level
  separator makes it land on boundaries.
- **No structural chunkers.** Code, tables and lists are prose to both shipped
  providers; a table split across two chunks loses its header.
