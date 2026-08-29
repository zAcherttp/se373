# @se373/authoring

## What it does

`ctx.authoring`: model-written code earns its way into a live tree. §6.5's run
order implemented literally — **gate → write → (install) → syntax → typecheck →
conformance → certify** — and only after every stage does the block registry's
mount policy start saying yes, for that version alone.

Two properties are load-bearing, both about failure:

- **A failed stage is a result, not an exception.** `author` resolves with
  `status: 'failed'`, the stage, and the checker's own output — tsc's
  diagnostics, or the suite naming the violated rule and the fixture that
  showed it — so repair is an ordinary loop iteration. Throwing is reserved for
  the gate refusing and for caller errors.
- **Nothing is written before approval (I8), and the approval binds bytes.**
  The plan digest covers the fork's parentage, its exact files, and what an
  install would fetch. Approve, edit a file, and the digest no longer matches.

A failed attempt removes its own scaffold — repair retries under the same name,
and a corpse from the first attempt would make every retry die on collision.

**The `?sha=` cache key is not decoration.** Node caches modules by URL, and a
repair loop re-authors at the same path; a bare import hands the suite the
*previous* attempt's class, and certification vouches for bytes it never ran.
The demo hit exactly that — the corrected fork "failed" with the broken fork's
own violation — and the staging path needs the same honesty at the mount.

## The staging gate (`./staging`)

Editing a certified fork re-earns the mount before the running tree sees the
new bytes. Upstream's HMR reloads on change, which is right for trusted code
and wrong for model-authored code; the gate owns reload-on-edit for forks
instead: watch → debounce → `recheck` (syntax → typecheck → conformance over
the current bytes) → on pass, refresh every row naming the fork to
`index.ts?sha=<digest>`; on fail, **decertify** and keep the live rows on the
previous bytes, loudly.

## Where forks live, and why

Under the repository's own `forks/` (gitignored), never `$SE373_HOME`: a fork
imports its seam packages, and Node resolves those by walking up from the fork
file. Forks are not workspace members, so the service maintains
`forks/package.json` linking the **fork-visible surface** (the seam layer, via
`link:`) and installs it once — the anchor both tsc and the runtime import
resolve through. A fork wanting a package off that list fails at typecheck,
loudly, which is the right default for model-written code. Third-party
dependencies (D8) land in the fork's own `package.json` and lockfile via
`pnpm install --ignore-workspace`.

## Depends on

The block registry (fork + certify + decertify), the plan gate (read
opportunistically), the scaffold, `@se373/digest`, the four conformance suites
(`chunker`, `vector-store`, `rerank`, `embedding`), and `typescript` for the
syntax stage; the typecheck stage spawns the workspace's own `tsc`.

## In / out

**In.** `author({ forkOf, name?, files, config?, dependencies?, summary?,
planId? })`; `recheck(name)`; `discard(name)`; config `root`.

**Out.** An `AuthoringReport` — `certified` with the registered block and its
directory, or `failed` with `stage`, `output`, and the stages `passed`. Events:
`authoring/finished`, `authoring/staged`.

## Known Limitations and Deferred Work

- **Whole-fork forks only.** `files` replaces nothing selectively; there is no
  diff-against-parent, and a fork does not track its parent's later versions.
- **The typecheck stage costs a tsc start (~2–4 s)** per attempt. No watch mode,
  no incremental state.
- **`recheck` covers `index.ts` only** for its digest; a multi-file fork whose
  helper file changed re-runs correctly (tsc and import see the disk) but the
  sha in the refreshed row name would not move if `index.ts` itself is
  byte-identical.
- **The suite instantiates with the parent's defaults.** A fork whose contract
  only breaks under other config passes.
- **`install` is not sandboxed.** D8's install runs pnpm with the network; the
  gate shows what would be fetched, and that is the whole defence.
- **Decertification does not dismantle.** A running row that was refreshed
  before the bytes went bad keeps serving the last-good module until something
  re-mounts it; the gate prevents the bad bytes from ever loading, not the old
  ones from running.
