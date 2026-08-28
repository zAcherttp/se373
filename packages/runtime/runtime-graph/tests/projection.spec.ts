/**
 * Three properties of the projection that a plausible-looking implementation
 * gets wrong, checked against a real tree rather than a fixture.
 *
 * `examples/realm-split/cordis.yml` is the tree, because it already contains
 * the awkward shapes: two groups, two isolation realms, and two providers of
 * one service name.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from '../../../../apps/cli/src/boot.ts'
import type { BootedTree } from '../../../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../../../scripts/ephemeral-home.ts'
import type { RuntimeGraphNode, RuntimeGraphSnapshot } from '../src/index.ts'

useEphemeralHome('runtime-graph-spec')

const CONFIG = resolve(
  fileURLToPath(import.meta.url),
  '../../../../..',
  'examples/realm-split/cordis.yml',
)

/** The narrow slice of the booted context these assertions read. */
interface GraphContext {
  runtimeGraph: { snapshot: (query?: { entryId?: string }) => RuntimeGraphSnapshot }
  on: (event: string, listener: (node: RuntimeGraphNode, next: () => RuntimeGraphNode) => RuntimeGraphNode) => () => void
}

let tree: BootedTree
let ctx: GraphContext

beforeAll(async () => {
  tree = await boot({ configFile: CONFIG, args: [], onExit: () => {}, logLevel: 1 })
  ctx = tree.ctx as unknown as GraphContext
}, 60_000)

afterAll(async () => { await tree.stop() })

/** One node by the id suffix the config actually wrote (the tree prefixes them). */
function node(snapshot: RuntimeGraphSnapshot, id: string): RuntimeGraphNode {
  const found = snapshot.nodes.find(candidate => candidate.entryId.endsWith(id))
  if (found === undefined) throw new Error(`no node ending "${id}" in ${String(snapshot.nodes.length)}`)
  return found
}

describe('edge resolution', () => {
  it('resolves one service name to two providers across two realms', () => {
    // The failure this guards is silent by construction: a name-keyed lookup
    // draws ONE plausible edge for both halves, and every other assertion in
    // the suite still passes. It is also the case the A/B design rests on.
    const snapshot = ctx.runtimeGraph.snapshot()
    const alpha = node(snapshot, 'alpha-consumer').edges.find(edge => edge.service === 'loggerJsonl')
    const beta = node(snapshot, 'beta-consumer').edges.find(edge => edge.service === 'loggerJsonl')

    expect(alpha?.satisfied).toBe(true)
    expect(beta?.satisfied).toBe(true)
    expect(alpha?.providerEntryId).toMatch(/alpha-sink$/)
    expect(beta?.providerEntryId).toMatch(/beta-sink$/)
    expect(alpha?.providerEntryId).not.toBe(beta?.providerEntryId)
  })

  it('reports an edge per declared injection, satisfied or not', () => {
    // An omitted edge leaves a node looking fully wired. Every node must
    // account for every name it declared.
    for (const candidate of ctx.runtimeGraph.snapshot().nodes) {
      expect(candidate.edges.map(edge => edge.service).sort()).toEqual([...candidate.injects].sort())
    }
  })
})

describe('narrowing by entry', () => {
  it('descends into a group, whose children do not share its id prefix', () => {
    // Group children keep flat ids while an included subtree's are prefixed, so
    // matching on the id string passes one shape and silently fails the other.
    // The projection walks the parent chain instead; this is what says so.
    const whole = ctx.runtimeGraph.snapshot()
    const group = node(whole, ':alpha')
    expect(group.structural).toBe('group')

    const subtree = ctx.runtimeGraph.snapshot({ entryId: group.entryId })
    const ids = subtree.nodes.map(candidate => candidate.entryId)
    expect(ids).toContain(group.entryId)
    expect(ids.some(id => id.endsWith('alpha-sink'))).toBe(true)
    expect(ids.some(id => id.endsWith('alpha-consumer'))).toBe(true)
    // The sibling group is not below this one.
    expect(ids.some(id => id.endsWith('beta-sink'))).toBe(false)
    // A narrowed report still says how much it left out.
    expect(subtree.totalNodes).toBe(whole.totalNodes)
    expect(subtree.nodes.length).toBeLessThan(whole.totalNodes)
  })
})

describe('the graph/node waterfall', () => {
  it('takes what a package means and refuses what it is', () => {
    // The rule is "a package may say what it means, never what it is". A
    // listener that returns a whole node could otherwise restate `lifecycle` or
    // `entryId`, and the graph would report a runtime that does not exist.
    const before = node(ctx.runtimeGraph.snapshot(), 'alpha-sink')
    const dispose = ctx.on('graph/node', (_node, next) => ({
      ...next(),
      role: 'seam',
      tier: 'L9',
      label: 'hijacked',
      entryId: 'not-a-real-row',
      lifecycle: 'failed',
      enabled: false,
      provides: [],
    }))
    try {
      const after = node(ctx.runtimeGraph.snapshot(), 'alpha-sink')
      // What it means: taken.
      expect(after.role).toBe('seam')
      expect(after.tier).toBe('L9')
      expect(after.label).toBe('hijacked')
      // What it is: untouched.
      expect(after.entryId).toBe(before.entryId)
      expect(after.lifecycle).toBe(before.lifecycle)
      expect(after.enabled).toBe(before.enabled)
      expect(after.provides).toEqual(before.provides)
    } finally {
      dispose()
    }
  })

  it('leaves a package that says nothing untyped rather than absent', () => {
    // ~190 vendored rows contribute nothing, so this is the ordinary case and
    // the graph has to be readable in it.
    const untyped = ctx.runtimeGraph.snapshot().nodes.filter(candidate => candidate.role === null)
    expect(untyped.length).toBeGreaterThan(0)
    for (const candidate of untyped) expect(candidate.entryId).toBeTruthy()
  })
})
