# @se373/knowledge-dedup

## What it does

A `knowledge/post-retrieve` listener that keeps at most N passages per document.

A listener rather than a seam, because §5.1's rule is cardinality: dedup,
diversity and budget truncation all stack, each is optional, and order matters —
which is a waterfall, not a pick-one.

The problem is specific to chunked retrieval and appears the moment a real
corpus is indexed. A long document is many chunks, its chunks overlap by
construction, and a query that matches one of them usually matches its
neighbours nearly as well. Nothing is wrong, and yet `k` hits turn out to be one
document said five ways — which is the least useful thing a fixed answer budget
can be spent on. It was visible in this repository's own demo before this
package existed.

## Depends on

`@se373/knowledge` for `RetrievedChunk` and the event declaration,
`@se373/cordis` and `@se373/schemastery`.

## In / out

**In — config.** `perDocument` (default `1`).

**Out.** A listener on `knowledge/post-retrieve`, and `capPerDocument(hits, n)`
exported for its spec.

Two properties are load-bearing:

- **Order is preserved, never regrouped.** Candidates arrive sorted by distance,
  so taking the first N per document keeps each document's *best* passage and
  leaves the overall ranking intact. Sorting by document first would silently
  promote a worse passage over a better one.
- **It delegates before filtering.** A waterfall listener that filters ahead of
  `next()` hides candidates from every listener registered after it, making the
  result depend on row order in a way nobody declared.

Hits with an empty `documentId` are passed through rather than capped together —
capping them would collapse every such hit into one.

## Known Limitations and Deferred Work

- **Document identity is exact-match on `documentId`.** Two copies of the same
  text at different paths are two documents, and the same document reachable
  under two roots is two documents.
- **No text-level similarity.** Near-identical passages from *different*
  documents — every README's `Known Limitations and Deferred Work`, for instance
  — are untouched. That is the other half of the problem and it needs an MMR or
  embedding-distance listener, which does not exist.
- **No budget truncation.** The architecture names token-budget truncation as a
  post-retrieve listener; nothing implements it, so a caller asking for `k`
  passages can still receive more text than fits a context.
- **Not order-independent among listeners.** Two listeners that both filter
  compose in registration order, and nothing declares or checks a sensible one.
