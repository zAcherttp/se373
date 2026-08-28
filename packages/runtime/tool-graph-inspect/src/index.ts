/**
 * `graph_inspect` — the first consumer of `ctx.runtimeGraph`, and the one that
 * proves the payload before any canvas exists.
 *
 * Writing the projection against a text renderer debugs the data model early:
 * if `graph_inspect` cannot answer a question in plain text, the phase-4 board
 * will not answer it either, and finding that out costs a tool call rather than
 * a React component.
 *
 * A separate package from the service on purpose. The service is infrastructure
 * every later consumer needs; handing the model a tool is a deployment choice,
 * and I3 says a deployment choice is a config row you can disable, not an import
 * you have to delete.
 *
 * @module @se373/tool-graph-inspect
 */

import type { Context } from '@se373/cordis'
import { defineTool } from '@se373/tools'
import type {} from '@se373/system-prompt'
import { FUNCTIONAL_KINDS, LIFECYCLE_PHASES, STRUCTURAL_KINDS } from '@se373/runtime-graph'
import type { RuntimeGraphNode, RuntimeGraphQuery, LifecyclePhase } from '@se373/runtime-graph'
import { renderSnapshot } from './render.ts'

export const name = 'tool-graph-inspect'
export const inject = ['tools', 'runtimeGraph', 'systemPrompt']

/**
 * Lifecycle values the model may pass. `none` stands for the `null` phase — a
 * row with no live fiber — because a JSON string enum cannot carry `null` and
 * "rows that are not running" is the most useful filter this tool offers.
 */
const LIFECYCLE_VALUES = [...LIFECYCLE_PHASES, 'none'] as const

type LifecycleArg = (typeof LIFECYCLE_VALUES)[number]

/** Map the model-facing lifecycle vocabulary onto the projection's own. */
function toPhase(value: LifecycleArg): LifecyclePhase {
  return value === 'none' ? null : value
}

/** Canonical JSON shape of one node, mirroring `RuntimeGraphNode` field for field. */
const NODE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entryId: { type: 'string', required: true, description: 'Loader entry id.' },
    parentEntryId: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
    moduleName: { type: 'string', required: true, description: 'Module specifier the loader imports.' },
    uid: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
    realm: { type: 'string', required: true, description: "Service-isolation realm; 'root' is the ordinary one." },
    structural: { type: 'string', required: true, enum: STRUCTURAL_KINDS },
    functional: {
      required: true,
      oneOf: [{ type: 'string', enum: FUNCTIONAL_KINDS }, { type: 'null' }],
      description: 'What the row contributes once running; null until it mounts.',
    },
    lifecycle: {
      required: true,
      oneOf: [
        { type: 'string', enum: LIFECYCLE_PHASES },
        { type: 'null' },
      ],
      description: 'Root fiber state; null when no live root fiber exists.',
    },
    enabled: { type: 'boolean', required: true, description: 'Effective enablement, including disabled ancestors.' },
    mounted: { type: 'boolean', required: true },
    provides: { type: 'array', items: { type: 'string' }, required: true },
    injects: { type: 'array', items: { type: 'string' }, required: true },
    unresolvedInjects: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: 'Declared dependencies not yet resolved — why a row sits in pending.',
    },
    config: { type: 'json', required: true, description: 'Resolved config, sanitized to JSON.' },
  },
} as const

/** Canonical output: the snapshot, exactly as the service produced it. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    capturedAt: { type: 'integer', required: true },
    totalNodes: { type: 'integer', required: true, description: 'Rows in the whole tree, before narrowing.' },
    nodes: { type: 'array', items: NODE_SCHEMA, required: true },
  },
} as const

const DESCRIPTION = 'Inspect the plugin runtime this agent is itself running inside. '
  + 'Returns one node per configured loader row — including rows that are disabled and therefore '
  + 'have no live instance, because a row you cannot see is one you cannot turn on. '
  + 'Each node carries three independent axes: structural (row/group/include), functional '
  + '(provider/tools/listener, null until it mounts) and lifecycle (pending/loading/active/failed/'
  + 'unloading, or none when nothing is live), plus its isolation realm, what it provides, what it '
  + 'declares it needs, and which of those needs are still unresolved. '
  + 'The tree is large: narrow with `entry_id` (that row and everything beneath it) or `lifecycle` '
  + 'rather than reading all of it. Use this to answer what is running, what failed, and why a '
  + 'component is stuck — not to change anything; this tool is read-only.'

/**
 * Register the tool and its prompt line.
 * @param ctx - the plugin context; `tools`, `runtimeGraph` and `systemPrompt` are injected.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:graph_inspect',
    order: 105,
    text: 'Use graph_inspect to see the plugin runtime you are running inside — which components are '
      + 'configured, which are live, which are disabled, and which are waiting on a dependency. '
      + 'Narrow it with entry_id or lifecycle; reading the whole tree at once is rarely what you want.',
  })

  ctx.tools.register(defineTool({
    name: 'graph_inspect',
    description: DESCRIPTION,
    parameters: {
      entry_id: {
        type: 'string',
        description: 'Keep only this loader entry and everything beneath it.',
      },
      lifecycle: {
        type: 'array',
        items: { type: 'string', enum: LIFECYCLE_VALUES },
        description: "Keep only rows in these lifecycle phases. 'none' selects rows with no live instance.",
      },
      enabled: {
        type: 'boolean',
        description: 'Keep only rows that are (true) or are not (false) effectively enabled.',
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderSnapshot(value as never) }],
    },
    // Reading a projection mutates nothing and touches no file, so two calls
    // may overlap freely.
    isConcurrencySafe: () => true,
    execute(args) {
      const query: RuntimeGraphQuery = {
        ...args.entry_id !== undefined ? { entryId: args.entry_id } : {},
        ...args.lifecycle !== undefined ? { lifecycle: args.lifecycle.map(toPhase) } : {},
        ...args.enabled !== undefined ? { enabled: args.enabled } : {},
      }
      const snapshot = ctx.runtimeGraph.snapshot(query)
      if (query.entryId !== undefined && snapshot.nodes.length === 0) {
        throw new Error(
          `no loader entry "${query.entryId}"; call graph_inspect without entry_id to list the configured rows`,
        )
      }
      return Promise.resolve({
        capturedAt: snapshot.capturedAt,
        totalNodes: snapshot.totalNodes,
        nodes: snapshot.nodes as unknown as RuntimeGraphNode[],
      } as never)
    },
  }))
}

export default { name, inject, apply }
