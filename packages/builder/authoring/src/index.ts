/**
 * `ctx.authoring` — model-written code earns its way into a live tree.
 *
 * §6.5's run order, implemented literally: **plan gate → write → (install) →
 * syntax → typecheck → conformance → certify**. Only after every stage does the
 * block registry's mount policy start saying yes — and only for that version:
 * a later edit is new bytes the suite has not seen.
 *
 * Two properties are load-bearing and both are about *failure*:
 *
 * - **A failed stage is a result, not an exception.** The architecture is
 *   explicit that suite output returns to the model as an ordinary tool result
 *   so repair is a normal loop iteration. So `author` resolves with
 *   `status: 'failed'`, the stage that failed, and the checker's own output —
 *   throwing is reserved for the gate refusing and for caller errors.
 * - **Nothing is written before approval (I8).** The plan's digest covers the
 *   fork's parentage, its exact file contents, and what an install would fetch.
 *   Approve, then edit the files, and the digest no longer matches: the
 *   approval died with the bytes it approved.
 *
 * Forks live under the repository's own `forks/` directory rather than in
 * `$SE373_HOME`, and the reason is module resolution: an authored fork imports
 * its seam package (`@se373/chunker`), and Node resolves that by walking up
 * from the *fork file's* location. Inside the repository that walk finds the
 * workspace's linked packages; from a temp directory it finds nothing.
 *
 * @module @se373/authoring
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Service } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { canonicalDigest } from '@se373/digest'
import { removeScaffold, writeScaffold } from '@se373/scaffold'
import { blockRef } from '@se373/block-registry'
import type { Block } from '@se373/block-registry'
import type { PlanGate } from '@se373/plan-gate'
import { contributeNode } from '@se373/runtime-graph'
import { assertChunkerConformance } from '@se373/chunker/conformance'
import type { Chunker } from '@se373/chunker'
import { assertVectorStoreConformance } from '@se373/vector-store/conformance'
import type { VectorStore } from '@se373/vector-store'
import { assertRerankerConformance } from '@se373/rerank/conformance'
import type { Reranker } from '@se373/rerank'
import { assertEmbedderConformance } from '@se373/embedding'
import type { Embedder } from '@se373/embedding'

declare module '@se373/cordis' {
  interface Context {
    authoring: AuthoringService
  }

  interface Events {
    /**
     * An authoring attempt finished, certified or not.
     * @param report - what happened, stage by stage.
     * @mode emit
     */
    'authoring/finished'(report: AuthoringReport): void
  }
}

/**
 * The packages a fork may import, linked into the namespace root.
 *
 * Forks are not workspace members — pnpm's workspace globs deliberately exclude
 * `forks/` — so nothing links `@se373/*` into scope for them: the repo root's
 * `node_modules` holds only the root's own devDependencies. The namespace gets
 * its own `package.json` of `link:` dependencies instead, installed once, and
 * every fork resolves through it — for tsc and for the runtime import alike.
 *
 * The list is the **fork-visible surface**: the seam layer and what it reaches.
 * A fork wanting a package not on it fails to resolve, loudly, at typecheck —
 * which is the right default for model-written code.
 */
const FORKABLE_LINKS: Readonly<Record<string, string>> = {
  '@se373/cordis': 'vendor/cordis',
  '@se373/cosmokit': 'vendor/cosmokit',
  '@se373/schemastery': 'vendor/schemastery',
  '@se373/digest': 'packages/knowledge/digest',
  '@se373/corpus': 'packages/knowledge/corpus',
  '@se373/chunker': 'packages/knowledge/chunker',
  '@se373/chunker-markdown': 'packages/knowledge/chunker-markdown',
  '@se373/chunker-recursive': 'packages/knowledge/chunker-recursive',
  '@se373/embedding': 'packages/knowledge/embedding',
  '@se373/vector-store': 'packages/knowledge/vector-store',
  '@se373/rerank': 'packages/knowledge/rerank',
}

/** One conformance runner per seam that ships one. */
const SUITES: Record<string, (instance: unknown) => Promise<void>> = {
  'ctx.chunker': async instance => { assertChunkerConformance(instance as Chunker) },
  'ctx.vectorStore': async instance => { await assertVectorStoreConformance(instance as VectorStore) },
  'ctx.reranker': async instance => { await assertRerankerConformance(instance as Reranker) },
  'ctx.embedder': async instance => { await assertEmbedderConformance(instance as Embedder) },
}

/** The stages, in the order they run. */
export const AUTHORING_STAGES = ['gate', 'write', 'install', 'syntax', 'typecheck', 'conformance', 'certify'] as const

/** One stage of the authoring pipeline. */
export type AuthoringStage = (typeof AUTHORING_STAGES)[number]

/** What an authoring attempt did. */
export interface AuthoringReport {
  /** Whether the fork is now mountable. */
  readonly status: 'certified' | 'failed'
  /** The fork's block, present once registration happened (certified only). */
  readonly block?: Block
  /** The fork's directory. Present only when certified — a failed attempt removes its scaffold. */
  readonly dir?: string
  /** The stage that failed, when one did. */
  readonly stage?: AuthoringStage
  /**
   * The failing checker's own output, verbatim.
   *
   * This is the repair loop's raw material: a typecheck failure is tsc's
   * diagnostics, a conformance failure is the suite naming the violated rule
   * and the fixture that showed it.
   */
  readonly output?: string
  /** Stages that completed, in order. */
  readonly passed: readonly AuthoringStage[]
}

/** The staging gate's judgement of edited bytes. */
export type StagingVerdict =
  | { readonly status: 'passed', readonly sha: string, readonly suite: string }
  | { readonly status: 'rejected', readonly stage: AuthoringStage, readonly suite: string, readonly output: string }

/** Thrown when authoring needs an approval it does not have. */
export class AuthoringPlanRequiredError extends Error {
  /** Stable machine-readable code. */
  readonly code = 'AUTHORING_PLAN_REQUIRED' as const
  /** The plan awaiting a decision. */
  readonly planId: string

  constructor(planId: string, summary: string) {
    super(
      `authoring writes model code into forks/ (${summary}) and a plan gate is mounted. `
      + `Approve plan ${planId}, then call author again with { planId: ${JSON.stringify(planId)} }.`,
    )
    this.name = 'AuthoringPlanRequiredError'
    this.planId = planId
  }
}

/** What a caller supplies. */
export interface AuthorRequest {
  /** The block being forked. Must name a plugin and a conformance suite. */
  readonly forkOf: string
  /** The fork's name; becomes its directory and block id. Defaults to the fork ordinal scheme. */
  readonly name?: string
  /** Source files, by fork-relative path. Must include `index.ts` default-exporting the provider class. */
  readonly files: Readonly<Record<string, string>>
  /** Config the conformance instance is constructed with. Defaults to the parent's defaults. */
  readonly config?: Readonly<Record<string, unknown>>
  /** Third-party dependencies to install into the fork's own lockfile (D8). */
  readonly dependencies?: Readonly<Record<string, string>>
  /** One line for the fork's manifest. */
  readonly summary?: string
  /** An approved plan id, from a previous refusal. */
  readonly planId?: string
}

/** Configuration for the authoring service. */
export interface Config {
  /** Where forks live. Defaults to `<cwd>/forks` — see the module note on resolution. */
  readonly root?: string
}

/**
 * The authoring pipeline.
 */
export class AuthoringService extends Service {
  static override readonly name = 'authoring'
  static inject = ['blocks'] as const

  static readonly Config: Schema<Config> = z.object({
    root: z.string(),
  }) as Schema<Config>

  private readonly root: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'authoring')
    this.root = resolve(config.root ?? join(process.cwd(), 'forks'))
    contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Authoring pipeline' })
  }

  /** The gate, when one is mounted. */
  private get gate(): PlanGate | undefined {
    return this.ctx.get('planGate') as PlanGate | undefined
  }

  /**
   * Author a fork of an existing block.
   * @param request - what to write and what it forks.
   * @returns certified with the registered block, or failed with the stage and its output.
   * @throws AuthoringPlanRequiredError when a mounted gate has not approved this exact request.
   */
  async author(request: AuthorRequest): Promise<AuthoringReport> {
    const parent = this.ctx.blocks.get(request.forkOf)
    if (parent === undefined) throw new Error(`no block ${JSON.stringify(request.forkOf)} to fork`)
    if (parent.conformance === undefined) {
      throw new Error(`${request.forkOf} names no conformance suite; an authored fork of it could never mount (I7)`)
    }
    const suite = SUITES[parent.conformance]
    if (suite === undefined) {
      throw new Error(`no conformance runner for ${parent.conformance}; known: ${Object.keys(SUITES).join(', ')}`)
    }
    if (request.files['index.ts'] === undefined) {
      throw new Error('files must include index.ts default-exporting the provider class')
    }
    const name = request.name ?? `${parent.id.replace(/^block\./, '')}-fork`

    // The gate covers the exact bytes: parentage, every file, and what an
    // install would fetch. Approve, edit a file, and the digest moves.
    const subject = {
      kind: 'authoring',
      forkOf: blockRef(parent),
      name,
      files: request.files,
      dependencies: request.dependencies ?? {},
    }
    const digest = canonicalDigest(subject)
    const gate = this.gate
    if (gate !== undefined) {
      if (request.planId !== undefined) {
        gate.consume(request.planId, digest)
      } else {
        const proposed = gate.propose({
          kind: 'authoring',
          summary: `fork ${parent.id} as ${name}: ${Object.keys(request.files).length} file(s)`
            + `${request.dependencies === undefined ? '' : `, installing ${Object.keys(request.dependencies).join(', ')}`}`,
          steps: [
            { summary: `write ${Object.keys(request.files).sort().join(', ')} to forks/${name}`, destructive: false },
            ...request.dependencies === undefined
              ? []
              : [{ summary: `pnpm install ${Object.entries(request.dependencies).map(([k, v]) => `${k}@${v}`).join(' ')} in the fork's own lockfile`, destructive: false }],
            { summary: `syntax → typecheck → ${parent.conformance} conformance; mountable only if all pass`, destructive: false },
          ],
          subject,
          detail: { forkOf: blockRef(parent), suite: parent.conformance },
        })
        if (proposed.status === 'approved') gate.consume(proposed.id, digest)
        else throw new AuthoringPlanRequiredError(proposed.id, proposed.summary)
      }
    }

    this.ensureNamespace()

    const passed: AuthoringStage[] = ['gate']
    const fail = (stage: AuthoringStage, output: string): AuthoringReport => {
      // A failed attempt removes its own scaffold. Repair is supposed to be an
      // ordinary loop iteration (§6.5), and a loop whose second attempt dies on
      // SCAFFOLD_EXISTS because the first left its corpse is not a loop -- the
      // demo's own broken-then-fixed arc hit exactly that. What survives a
      // failure is the report, not the files: nothing that failed a stage
      // should be importable from disk later.
      if (dir !== undefined) removeScaffold(this.root, name)
      const report: AuthoringReport = { status: 'failed', stage, output, passed }
      this.ctx.emit('authoring/finished', report)
      return report
    }

    // --- write ----------------------------------------------------------------
    let dir: string | undefined
    mkdirSync(this.root, { recursive: true })
    const manifest = {
      name: `@forks/${name}`,
      private: true,
      type: 'module',
      // The fork's own dependency universe (D8): third-party packages land in
      // its own node_modules under its own lockfile. Its @se373/* imports are
      // deliberately NOT here -- they resolve up the tree to the workspace.
      ...request.dependencies === undefined ? {} : { dependencies: request.dependencies },
    }
    try {
      dir = writeScaffold(this.root, name, {
        ...request.files,
        'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
      })
    } catch (error) {
      return fail('write', error instanceof Error ? error.message : String(error))
    }
    passed.push('write')

    // --- install (D8) ---------------------------------------------------------
    if (request.dependencies !== undefined && Object.keys(request.dependencies).length > 0) {
      const install = spawnSync('pnpm', ['install', '--ignore-workspace'], { cwd: dir, encoding: 'utf8' })
      if (install.status !== 0) {
        return fail('install', `${install.stdout}\n${install.stderr}`.trim())
      }
      passed.push('install')
    }

    // --- syntax ---------------------------------------------------------------
    // Cheap and early: a parse error found here costs milliseconds; the same
    // error found by tsc costs a compiler start.
    try {
      const ts = await import('typescript')
      for (const [file, source] of Object.entries(request.files)) {
        if (!file.endsWith('.ts')) continue
        const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
        const diagnostics = (parsed as unknown as { parseDiagnostics?: { messageText: unknown, start?: number }[] }).parseDiagnostics ?? []
        if (diagnostics.length > 0) {
          const first = diagnostics[0]!
          return fail('syntax', `${file}: ${ts.flattenDiagnosticMessageText(first.messageText as never, '\n')}`)
        }
      }
    } catch (error) {
      return fail('syntax', error instanceof Error ? error.message : String(error))
    }
    passed.push('syntax')

    // --- typecheck ------------------------------------------------------------
    // A real tsc run over the fork, against the workspace's own compiler
    // settings. Model code that "works" under type stripping and lies about its
    // seam types is precisely what this stage exists to stop.
    const tsconfigPath = join(dir, 'tsconfig.fork.json')
    writeFileSync(tsconfigPath, `${JSON.stringify({
      extends: join(this.workspaceRoot(), 'tsconfig.base.json'),
      // No `types: []`: the fork compiles the linked seam SOURCES, which use
      // node builtins, and @types/node is found by the default typeRoots walk
      // up to the repository root.
      compilerOptions: { noEmit: true, composite: false, incremental: false },
      include: ['*.ts', '**/*.ts'],
      exclude: ['node_modules'],
    }, null, 2)}\n`)
    const tsc = spawnSync(
      join(this.workspaceRoot(), 'node_modules', '.bin', 'tsc'),
      ['-p', tsconfigPath],
      { cwd: dir, encoding: 'utf8' },
    )
    if (tsc.status !== 0) {
      return fail('typecheck', `${tsc.stdout}\n${tsc.stderr}`.trim())
    }
    passed.push('typecheck')

    // --- conformance ----------------------------------------------------------
    let instance: unknown
    try {
      // The digest query is load-bearing, not decoration. Node caches modules
      // by URL, and a repair loop re-authors under the same name at the same
      // path -- a bare import would hand the suite the PREVIOUS attempt's
      // class, and certification would vouch for bytes it never ran. The demo
      // hit exactly that: the corrected fork "failed" with the broken fork's
      // own violation. Keying the URL by content makes the cache honest.
      const moduleUrl = `${pathToFileURL(join(dir, 'index.ts')).href}?sha=${digest.slice(0, 16)}`
      const loaded = await import(moduleUrl) as { default?: new (ctx: Context, config?: unknown) => unknown }
      if (typeof loaded.default !== 'function') {
        return fail('conformance', 'index.ts has no default export; expected the provider class')
      }
      instance = new loaded.default(new Context() as never, request.config ?? parent.manifest.defaults ?? {})
    } catch (error) {
      return fail('conformance', error instanceof Error ? error.message : String(error))
    }
    try {
      await suite(instance)
    } catch (error) {
      return fail('conformance', error instanceof Error ? error.message : String(error))
    }
    passed.push('conformance')

    // --- certify --------------------------------------------------------------
    const block = this.ctx.blocks.fork(parent.id, {
      origin: 'agent',
      id: name,
      manifest: {
        summary: request.summary ?? `authored fork of ${parent.id}`,
        plugin: join(dir, 'index.ts'),
        ...request.config === undefined ? {} : { defaults: request.config },
      },
    })
    this.ctx.blocks.certify(name)
    passed.push('certify')

    const report: AuthoringReport = { status: 'certified', block, dir, passed }
    this.ctx.emit('authoring/finished', report)
    return report
  }

  /**
   * Re-run the checking stages over a fork's CURRENT bytes.
   *
   * The staging gate's engine: no gate consult (the original authoring was
   * approved; this judges an edit to it), no write (the bytes are already on
   * disk), no registration (a pass re-vouches for what exists, a failure
   * decertifies at the caller). Same syntax → typecheck → conformance order,
   * same suites, same cache honesty — the conformance import is keyed by the
   * current content's digest, because judging stale bytes is precisely the bug
   * this pipeline already met once.
   * @param forkName - the fork directory's name.
   * @returns passed with the content sha, or rejected with the stage and output.
   */
  async recheck(forkName: string): Promise<StagingVerdict> {
    const block = this.ctx.blocks.get(forkName)
    const parentRef = block?.forkedFrom
    const suiteName = block?.conformance ?? 'ctx.chunker'
    const suite = SUITES[suiteName]
    if (block === undefined || parentRef === undefined || suite === undefined) {
      return { status: 'rejected', stage: 'conformance', suite: suiteName, output: `no certified fork ${forkName} to recheck` }
    }
    const dir = join(this.root, forkName)
    let source: string
    try {
      source = readFileSync(join(dir, 'index.ts'), 'utf8')
    } catch (error) {
      return { status: 'rejected', stage: 'write', suite: suiteName, output: String(error) }
    }
    const sha = canonicalDigest({ 'index.ts': source }).slice(0, 16)

    const ts = await import('typescript')
    const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.ESNext, true)
    const diagnostics = (parsed as unknown as { parseDiagnostics?: { messageText: unknown }[] }).parseDiagnostics ?? []
    if (diagnostics.length > 0) {
      return {
        status: 'rejected', stage: 'syntax', suite: suiteName,
        output: ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText as never, '\n'),
      }
    }

    const tsc = spawnSync(
      join(this.workspaceRoot(), 'node_modules', '.bin', 'tsc'),
      ['-p', join(dir, 'tsconfig.fork.json')],
      { cwd: dir, encoding: 'utf8' },
    )
    if (tsc.status !== 0) {
      return { status: 'rejected', stage: 'typecheck', suite: suiteName, output: `${tsc.stdout}\n${tsc.stderr}`.trim() }
    }

    try {
      const moduleUrl = `${pathToFileURL(join(dir, 'index.ts')).href}?sha=${sha}`
      const loaded = await import(moduleUrl) as { default?: new (ctx: Context, config?: unknown) => unknown }
      if (typeof loaded.default !== 'function') {
        return { status: 'rejected', stage: 'conformance', suite: suiteName, output: 'index.ts has no default export' }
      }
      const instance = new loaded.default(new Context() as never, block.manifest.defaults ?? {})
      await suite(instance)
    } catch (error) {
      return {
        status: 'rejected', stage: 'conformance', suite: suiteName,
        output: error instanceof Error ? error.message : String(error),
      }
    }
    return { status: 'passed', sha, suite: suiteName }
  }

  /**
   * Make the namespace resolvable, once.
   *
   * Writes `forks/package.json` linking the fork-visible surface and installs
   * it when its `node_modules` is absent. Idempotent and cheap after the first
   * run; the lockfile it creates is the namespace's own, which is D8's rule
   * applied one level up.
   */
  private ensureNamespace(): void {
    mkdirSync(this.root, { recursive: true })
    const manifestPath = join(this.root, 'package.json')
    const workspace = this.workspaceRoot()
    const manifest = {
      name: '@forks/namespace',
      private: true,
      description: 'Resolution anchor for authored forks. Generated; not a workspace member.',
      dependencies: Object.fromEntries(
        Object.entries(FORKABLE_LINKS).map(([name, path]) => [name, `link:${join(workspace, path)}`]),
      ),
    }
    const rendered = `${JSON.stringify(manifest, null, 2)}\n`
    const current = (() => {
      try { return readFileSync(manifestPath, 'utf8') } catch { return null }
    })()
    if (current !== rendered) writeFileSync(manifestPath, rendered)
    if (current !== rendered || !existsSync(join(this.root, 'node_modules'))) {
      const install = spawnSync('pnpm', ['install', '--ignore-workspace'], { cwd: this.root, encoding: 'utf8' })
      if (install.status !== 0) {
        throw new Error(`authoring: linking the fork namespace failed:\n${install.stdout}\n${install.stderr}`)
      }
    }

    // The typecheck stage resolves vendored framework names through their
    // `types` exports, which point at built lib/types declarations -- absent on
    // a fresh checkout, at which point tsc falls back to compiling vendor
    // SOURCES under our strict options and drowns the fork in someone else's
    // diagnostics. (Found by the tag-verification rule: the main checkout
    // passed on locally built artifacts.) So the pipeline builds its reference
    // surface once, and tsc -b makes every later call an incremental no-op.
    if (!existsSync(join(workspace, 'vendor', 'cordis', 'lib', 'types', 'index.d.ts'))) {
      const projects = ['chunker-markdown', 'chunker-recursive', 'embedding', 'vector-store', 'rerank']
        .map(pkg => join(workspace, 'packages', 'knowledge', pkg))
      const build = spawnSync(
        join(workspace, 'node_modules', '.bin', 'tsc'),
        ['-b', ...projects],
        { cwd: workspace, encoding: 'utf8' },
      )
      if (build.status !== 0) {
        throw new Error(`authoring: building the seam reference surface failed:\n${build.stdout}\n${build.stderr}`)
      }
    }
  }

  /** The workspace root, resolved from this file's own location. */
  private workspaceRoot(): string {
    return resolve(import.meta.dirname, '..', '..', '..', '..')
  }

  /** Where forks live. */
  get path(): string {
    return this.root
  }

  /**
   * Remove a fork's directory.
   *
   * The block's registry versions survive — removing the files is not the same
   * as forgetting the fork existed — but an uncertified re-author of the same
   * name becomes possible again.
   * @param name - the fork's name.
   */
  discard(name: string): void {
    removeScaffold(this.root, name)
  }
}

export default AuthoringService
