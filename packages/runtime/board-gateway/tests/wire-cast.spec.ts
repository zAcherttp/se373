/**
 * The gateway's wire types are a hand-kept copy of the projection's, and the
 * copy is what the generated codec is built from.
 *
 * That codec is the actual gate: Zod strips unknown keys, so a field the
 * projection produces and `BoardNode` forgot is dropped on the way out — the
 * board renders a node quietly less than the one the host has, and nothing
 * anywhere reports it. The package's own invariant compares row *identity* and
 * would miss this entirely.
 *
 * Testing `board.snapshot()` directly would not catch it either: that method
 * spreads the projected node, so an undeclared field passes through in process
 * and only disappears at the codec. This spec therefore runs a real node
 * through the real generated schema.
 *
 * Requires `pnpm build:vendor` — the codec is generated, not source.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { boot } from '../../../../apps/cli/src/boot.ts'
import type { BootedTree } from '../../../../apps/cli/src/boot.ts'
import { useEphemeralHome } from '../../../../scripts/ephemeral-home.ts'
// The generated codec, imported as the artifact it is: this is the schema that
// actually decides what crosses, and its .d.ts sits beside it.
import TYPERT_REMOTE from '../lib/typert.remote-client.js'
import type { BoardSnapshot } from '../src/types.ts'
import type { RuntimeGraphSnapshot } from '@se373/runtime-graph'

useEphemeralHome('board-gateway-spec')

const CONFIG = resolve(fileURLToPath(import.meta.url), '../../../../..', 'examples/realm-split/cordis.yml')

/** The generated result schema for `board.snapshot`, which is what crosses. */
const schema = (TYPERT_REMOTE as {
  readonly descriptors: readonly {
    readonly method: string
    readonly result: { readonly schema: { parse: (value: unknown) => BoardSnapshot } }
  }[]
}).descriptors.find(descriptor => descriptor.method === 'snapshot')?.result.schema

let tree: BootedTree
let direct: RuntimeGraphSnapshot
let wire: BoardSnapshot

beforeAll(async () => {
  // The gateway is a row in that tree rather than an import here: its `@Remote`
  // decorator is compiled by the loader's own pipeline, not by the one a spec's
  // imports go through.
  tree = await boot({ configFile: CONFIG, args: [], onExit: () => {}, logLevel: 1 })
  const ctx = tree.ctx as unknown as {
    board: { snapshot: () => BoardSnapshot }
    runtimeGraph: { snapshot: () => RuntimeGraphSnapshot }
  }
  direct = ctx.runtimeGraph.snapshot()
  wire = ctx.board.snapshot()
}, 60_000)

afterAll(async () => { await tree.stop() })

it('crosses the codec with every field the projection produces', () => {
  expect(schema, 'no generated snapshot descriptor — run pnpm build:vendor').toBeDefined()
  const encoded = schema?.parse(wire)

  const projected = direct.nodes.find(node => node.edges.length > 0 && node.transitions.length > 0)
  expect(projected, 'the fixture tree produced no node with both edges and transitions').toBeDefined()
  const crossed = encoded?.nodes.find(node => node.entryId === projected?.entryId)

  expect(Object.keys(crossed ?? {}).sort()).toEqual(Object.keys(projected ?? {}).sort())
  expect(Object.keys(crossed?.edges[0] ?? {}).sort()).toEqual(Object.keys(projected?.edges[0] ?? {}).sort())
  expect(Object.keys(crossed?.transitions[0] ?? {}).sort())
    .toEqual(Object.keys(projected?.transitions[0] ?? {}).sort())
})

it('carries every row, and says how many there were', () => {
  expect(wire.nodes.map(node => node.entryId).sort())
    .toEqual(direct.nodes.map(node => node.entryId).sort())
  expect(wire.totalNodes).toBe(direct.totalNodes)
})

it('copies the nested arrays rather than aliasing the projection', () => {
  // The wire shape is mutable and the projection's is not, so handing a
  // consumer the projection's own arrays would let a value bound for a browser
  // be mutated by whoever holds it next.
  const withEdges = direct.nodes.find(node => node.edges.length > 0)
  const crossed = wire.nodes.find(node => node.entryId === withEdges?.entryId)
  expect(crossed?.edges).not.toBe(withEdges?.edges)
  expect(crossed?.edges[0]).not.toBe(withEdges?.edges[0])
  expect(crossed?.edges).toEqual(withEdges?.edges)
})
