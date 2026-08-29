# @se373/digest

## What it does

One canonical SHA-256, used by every stage of the write path.

The knowledge plane's central rule is that staleness is **computed, never
declared**: a model-authored config block can misstate a boolean, but it cannot
forge a hash of what it resolved to. That rule is only as good as the hash, and
a hash has two ways to betray it — being unstable, so the same configuration
digests differently and a rebuild that should have been a no-op throws away a
working index; and diverging, so four stages canonicalize differently and the
day two of them disagree is the day a genuine change reads as no change.

Hence one implementation, in one package with no dependencies.

## Depends on

`node:crypto`. Nothing else, deliberately: everything else in the plane depends
on this, so anything it depended on would be depended on by all of them.

## In / out

| Export | In | Out |
|---|---|---|
| `canonicalJson(value)` | any JSON-representable value | JSON text with object keys sorted at every depth |
| `canonicalDigest(value)` | ditto | lowercase hex SHA-256 of that text |
| `stageDigest(providerName, config)` | a package name and its resolved config | the stage reference used in the generation key |
| `contentDigest(text)` | a string | SHA-256 of its UTF-8 bytes |

`stageDigest` includes the provider's package name because two providers
configured identically are still two providers: `chunker-recursive` at size 800
and `chunker-markdown` at size 800 produce different chunks from one document.

`contentDigest` is separate from `canonicalDigest` on purpose — a document's
content hash is over its bytes, not over a JSON encoding of them, so it is
comparable to a digest computed by anything else that reads the same file.

## Known Limitations and Deferred Work

- **Array order is significant.** That is right for a separator ladder and wrong
  for a set; callers that mean a set sort before calling, and nothing enforces
  it.
- **Undefined is not representable.** `canonicalJson(undefined)` yields
  `'null'`, so `{a: undefined}` and `{a: null}` digest alike. No caller relies
  on the difference and nothing checks.
- **No streaming.** `canonicalDigest` builds the whole canonical string in
  memory, which is fine for config and wrong for a corpus.
- **Not versioned.** A change to the canonical form silently invalidates every
  index in existence. That is the correct behaviour and there is no migration
  path; it would have to be a deliberate, announced change.
