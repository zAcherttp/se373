/**
 * `ctx.builder` — intent becomes a resolved agent, and only then a running one.
 *
 * Three separate acts, deliberately not one:
 *
 * 1. **Resolve.** A recipe or a block list becomes an {@link AgentSpec} — a
 *    named, versioned value (I4), registered in `ctx.blocks` like anything else.
 *    Nothing runs; nothing is written outside the repository.
 * 2. **Approve.** The spec is digested and proposed to `ctx.planGate`. Nothing
 *    is fabricated before a human said yes to *that digest* (I8).
 * 3. **Fabricate.** The spec becomes a live Cordis subtree through the loader,
 *    so it appears on the runtime graph by itself (I5) and unwinds with one
 *    disposer (I6). There is no "show the new agent" feature to write, and a
 *    failed fabrication leaves no wreckage — which is what makes attempting one
 *    live a reasonable thing to do.
 *
 * **The model authors implementations, never seam contracts (I1).** Everything
 * here composes existing blocks: the builder chooses *which* rows and *what
 * config*, and cannot invent a seam. Authoring a new provider behind an existing
 * seam is phase 6d, and it arrives as a block with `origin: 'agent'` that this
 * registry already refuses to mount until its suite passes.
 *
 * @module @se373/builder
 */

import { Context, Service } from '@se373/cordis'
import type {} from '@se373/cordis-plugin-loader'
import { canonicalDigest } from '@se373/digest'
import { contributeNode } from '@se373/runtime-graph'
import { blockRef } from '@se373/block-registry'
import type { Block } from '@se373/block-registry'
import type { PlanGate, PlanStep } from '@se373/plan-gate'
import type {
  AgentSpec,
  BuildPlan,
  BuildRequest,
  BuildWarning,
  FabricatedAgent,
  SpecRow,
} from './types.ts'

export * from './types.ts'

declare module '@se373/cordis' {
  interface Context {
    builder: AgentBuilder
  }

  interface Events {
    /**
     * A spec was resolved and registered.
     * @param plan - the resolved spec, its digest and its warnings.
     * @mode emit
     */
    'builder/planned'(plan: BuildPlan): void
    /**
     * A spec became a live subtree.
     * @param agent - the fabricated agent.
     * @mode emit
     */
    'builder/fabricated'(agent: FabricatedAgent): void
    /**
     * A fabricated subtree was removed.
     * @param agent - the agent that was dismantled.
     * @mode emit
     */
    'builder/dismantled'(agent: FabricatedAgent): void
  }
}

/** The group module a fabricated subtree mounts as. */
const GROUP_PLUGIN = '@se373/cordis-plugin-group'

/** `ctx.vectorStore` → `vectorStore`; anything else is returned unchanged. */
export function seamKey(seam: string): string {
  return seam.startsWith('ctx.') ? seam.slice('ctx.'.length) : seam
}

/**
 * Service names a block publishes.
 *
 * `provides` when it declares one, the seam's key otherwise. Two fields rather
 * than one because they answer different questions: a seam is what gets
 * *isolated*, and `provides` is what a sibling row can *inject*. Core services
 * have the second and not the first.
 * @param block - the block, or `undefined`.
 * @returns the service names, possibly empty.
 */
export function providedBy(block: Block | undefined): string[] {
  if (block === undefined) return []
  if (block.manifest.provides !== undefined) return [...block.manifest.provides]
  return block.manifest.seam === undefined ? [] : [seamKey(block.manifest.seam)]
}

/**
 * The builder.
 */
export class AgentBuilder extends Service {
  static override readonly name = 'builder'
  static inject = ['blocks', 'loader'] as const

  private readonly agents = new Map<string, FabricatedAgent>()
  private readonly plans = new Map<string, BuildPlan>()

  constructor(ctx: Context) {
    super(ctx, 'builder')
    contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Agent builder' })
  }

  /** The gate, when one is mounted. */
  private get gate(): PlanGate | undefined {
    return this.ctx.get('planGate') as PlanGate | undefined
  }

  /** Read a recipe's prefill, or fail naming the cookbook. */
  private recipeOf(id: string): Block {
    const block = this.ctx.blocks.get(id)
    if (block === undefined || block.kind !== 'recipe') {
      const available = this.ctx.blocks.list({ kind: 'recipe' }).map(entry => entry.id)
      throw new Error(`no recipe ${JSON.stringify(id)}; the cookbook has: ${available.join(', ') || '(empty)'}`)
    }
    return block
  }

  /**
   * Turn a request into a resolved, registered, digested spec.
   *
   * Blocks are resolved one at a time and every failure becomes a warning
   * rather than an exception: a plan that cannot be produced is a plan nobody
   * can look at, and the whole point of a plan card is to show a human what is
   * about to happen *including* the parts that will not.
   * @param request - a recipe, a block list, or both.
   * @returns the plan, proposed to the gate when one is mounted.
   */
  async plan(request: BuildRequest): Promise<BuildPlan> {
    const recipe = request.recipe === undefined ? null : this.recipeOf(request.recipe)
    const prefill = (recipe?.manifest.defaults ?? {}) as {
      prompt?: string
      preset?: string
      blocks?: readonly string[]
    }
    const wanted = request.blocks ?? prefill.blocks ?? []
    const name = request.name ?? recipe?.id.replace(/^recipe\./, '') ?? 'agent'

    const warnings: BuildWarning[] = []
    const rows: SpecRow[] = []
    const isolates = new Set<string>()

    for (const id of wanted) {
      const block = this.ctx.blocks.get(id)
      if (block === undefined) {
        warnings.push({ block: id, message: 'not in the repository; skipped' })
        continue
      }
      if (block.manifest.plugin === undefined) {
        warnings.push({ block: id, message: 'names no plugin, so it cannot become a row; skipped' })
        continue
      }
      const verdict = this.ctx.blocks.mountable(id)
      if (!verdict.allowed) {
        warnings.push({ block: id, message: verdict.reason })
        continue
      }
      // A blocked-tier block is mounted inert rather than dropped. Connecting
      // the thing it needs then upgrades the agent instead of enabling it (I2),
      // and the row is visible on the graph in the meantime.
      const blocked = block.manifest.tier === 'blocked'
      if (blocked) {
        warnings.push({
          block: id,
          message: `needs ${block.manifest.requires?.join(', ') || 'configuration'}; mounted disabled`,
        })
      }
      rows.push({
        id,
        name: block.manifest.plugin,
        ...block.manifest.defaults === undefined ? {} : { config: block.manifest.defaults },
        ...blocked ? { disabled: true } : {},
        block: blockRef(block),
      })
      if (block.manifest.seam !== undefined) isolates.add(seamKey(block.manifest.seam))
    }

    // A row whose injections nothing satisfies mounts `pending` and never
    // starts. That is a legible state on the graph *afterwards*, and a silent
    // one in a plan -- so the plan says it first, while there is still someone
    // to say it to. Provided-by-this-spec counts; provided by the parent counts;
    // anything else does not.
    const provided = new Set<string>()
    for (const row of rows) {
      for (const service of providedBy(this.ctx.blocks.get(row.id))) provided.add(service)
    }
    for (const row of rows) {
      const block = this.ctx.blocks.get(row.id)
      const missing = (block?.manifest.inject ?? []).filter(service =>
        !provided.has(service) && this.ctx.get(service) === undefined)
      if (missing.length > 0) {
        warnings.push({
          block: row.id,
          message: `will not start: nothing provides ${missing.join(', ')}`,
        })
      }
    }

    const previous = this.ctx.blocks.versions(`spec.${name}`).at(-1)
    const spec: AgentSpec = {
      name,
      version: (previous?.version ?? 0) + 1,
      recipe: recipe?.id ?? null,
      preset: prefill.preset ?? 'standard',
      prompt: request.intent ?? prefill.prompt ?? '',
      rows,
      isolates: [...isolates].sort(),
    }

    const registered = this.ctx.blocks.register({
      id: `spec.${name}`,
      kind: 'pipeline',
      origin: 'agent',
      manifest: {
        summary: `${spec.rows.length} rows from ${spec.recipe ?? 'an explicit block list'}`,
        role: 'core',
        tier: 'ready',
        defaults: spec as unknown as Record<string, unknown>,
      },
    })

    const digest = canonicalDigest(spec)
    const gate = this.gate
    const planId = gate === undefined
      ? null
      : gate.propose({
          kind: 'agent-fabrication',
          summary: `fabricate ${spec.name} v${spec.version}: ${spec.rows.length} rows`,
          steps: this.steps(spec, warnings),
          subject: spec,
          detail: { specRef: blockRef(registered), recipe: spec.recipe, warnings },
        }).id

    const plan: BuildPlan = { planId, digest, spec, specRef: blockRef(registered), warnings }
    this.plans.set(digest, plan)
    this.ctx.emit('builder/planned', plan)
    return plan
  }

  /** The plan card's steps, in the order they will happen. */
  private steps(spec: AgentSpec, warnings: readonly BuildWarning[]): PlanStep[] {
    const steps: PlanStep[] = [{
      summary: `mount ${spec.rows.length} rows in a new realm "${spec.name}"`,
      // Mounting a subtree destroys nothing: it unwinds with one disposer (I6),
      // which is exactly why a live attempt is safe.
      destructive: false,
    }]
    if (spec.isolates.length > 0) {
      steps.push({ summary: `isolate ${spec.isolates.join(', ')} so it cannot collide with the root realm`, destructive: false })
    }
    for (const warning of warnings) {
      steps.push({ summary: `${warning.block}: ${warning.message}`, destructive: false })
    }
    return steps
  }

  /**
   * Mount a planned spec as a live subtree.
   *
   * The gate is consumed *before* anything is created, so a rejected or
   * mismatched approval leaves the tree untouched rather than half-built.
   * @param digest - the plan's digest, from {@link plan}.
   * @returns the running agent.
   * @throws when the plan is unknown, or the gate refuses.
   */
  async fabricate(digest: string): Promise<FabricatedAgent> {
    const plan = this.plans.get(digest)
    if (plan === undefined) throw new Error(`no plan with digest ${digest.slice(0, 12)}…; call plan() first`)
    if (plan.planId !== null) this.gate?.consume(plan.planId, digest)

    const { spec } = plan
    const entryId = await this.ctx.loader.create({
      name: GROUP_PLUGIN,
      group: true,
      // Isolating exactly the seams the spec provides is §6.3's collision guard.
      // Without it the second fabrication publishes into the root realm and one
      // instance silently answers for everybody.
      isolate: Object.fromEntries(spec.isolates.map(key => [key, `${spec.name}-v${spec.version}`])),
      config: spec.rows.map(row => ({
        id: row.id,
        name: row.name,
        ...row.config === undefined ? {} : { config: row.config },
        ...row.disabled === true ? { disabled: true } : {},
      })),
    })

    const agent: FabricatedAgent = {
      entryId,
      spec,
      specRef: plan.specRef,
      planId: plan.planId,
      createdAt: Date.now(),
    }
    this.agents.set(entryId, agent)
    this.ctx.emit('builder/fabricated', agent)
    return agent
  }

  /** Every fabricated agent still mounted, newest first. */
  list(): FabricatedAgent[] {
    return [...this.agents.values()].sort((left, right) => right.createdAt - left.createdAt)
  }

  /**
   * Remove a fabricated subtree.
   *
   * One disposer, because that is what a Cordis subtree is (I6). The spec it was
   * built from stays in the repository — dismantling a running agent is not the
   * same as forgetting how it was built, and the version you would roll back to
   * has to survive.
   * @param entryId - the id returned by {@link fabricate}.
   */
  async dismantle(entryId: string): Promise<void> {
    const agent = this.agents.get(entryId)
    if (agent === undefined) throw new Error(`no fabricated agent ${entryId}`)
    await this.ctx.loader.remove(entryId)
    this.agents.delete(entryId)
    this.ctx.emit('builder/dismantled', agent)
  }
}

export default AgentBuilder
