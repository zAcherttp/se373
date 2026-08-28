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
import { contributeNode, FUNCTIONAL_KINDS, LIFECYCLE_PHASES, NODE_ROLES, STRUCTURAL_KINDS } from '@se373/runtime-graph'
import type { NodeRole, RuntimeGraphNode, RuntimeGraphQuery, LifecyclePhase } from '@se373/runtime-graph'
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

/**
 * Role values the model may pass. `untyped` stands for the `null` role — a
 * package that contributes nothing — for the same reason `none` exists above.
 */
const ROLE_VALUES = [...NODE_ROLES, 'untyped'] as const

type RoleArg = (typeof ROLE_VALUES)[number]

/** Map the model-facing lifecycle vocabulary onto the projection's own. */
function toPhase(value: LifecycleArg): LifecyclePhase {
  return value === 'none' ? null : value
}

/** Map the model-facing role vocabulary onto the projection's own. */
function toRole(value: RoleArg): NodeRole | null {
  return value === 'untyped' ? null : value
}

/** One resolved dependency edge. */
const EDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    service: { type: 'string', required: true, description: 'The declared service name.' },
    satisfied: {
      type: 'boolean',
      required: true,
      description: 'Whether the name reaches a live provider in the requesting row\'s realm.',
    },
    providerEntryId: {
      required: true,
      oneOf: [{ type: 'string' }, { type: 'null' }],
      description: 'The providing row, or null when unsatisfied or provided by the root context.',
    },
    providerName: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const

/** One observed lifecycle change. */
const TRANSITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: { required: true, oneOf: [{ type: 'string', enum: LIFECYCLE_PHASES }, { type: 'null' }] },
    to: { required: true, oneOf: [{ type: 'string', enum: LIFECYCLE_PHASES }, { type: 'null' }] },
    at: { type: 'integer', required: true, description: 'Wall-clock time of the change.' },
    sn: {
      type: 'integer',
      required: true,
      description: 'Log sequence watermark at capture; compare against sn in the JSONL run log.',
    },
  },
} as const

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
      description: "Declared dependencies this row's own fiber has not resolved — why it sits in pending.",
    },
    edges: {
      type: 'array',
      items: EDGE_SCHEMA,
      required: true,
      description: "One per declared injection, resolved in this row's own realm. Unsatisfied ones are marked, never omitted.",
    },
    transitions: {
      type: 'array',
      items: TRANSITION_SCHEMA,
      required: true,
      description: 'Observed fiber state changes for this row, oldest first. Not log lines.',
    },
    role: {
      required: true,
      oneOf: [{ type: 'string', enum: NODE_ROLES }, { type: 'null' }],
      description: 'Contributed semantic role; null for a package that contributes nothing.',
    },
    tier: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
    label: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
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
  + 'Each node carries three derived axes: structural (row/group/include), functional '
  + '(provider/tools/listener, null until it mounts) and lifecycle (pending/loading/active/failed/'
  + 'unloading, or none when nothing is live), plus its isolation realm, what it provides, and one '
  + 'edge per declared dependency naming who satisfies it **in that row\'s own realm** — two rows '
  + 'injecting one service name in two realms reach two different providers, and the edges say so. '
  + 'An unsatisfied dependency is marked, never omitted. Each node also carries its observed '
  + 'lifecycle transitions, stamped with the log sequence watermark, so you can see how a component '
  + 'came up long after its log lines have gone. A package may additionally contribute a semantic '
  + 'role (seam/provider/core/tool), tier and label; most contribute nothing and read as untyped. '
  + 'The tree is large: narrow with `entry_id` (that row and everything beneath it), `lifecycle` or '
  + '`role` rather than reading all of it. Use this to answer what is running, what failed, and why '
  + 'a component is stuck — not to change anything; this tool is read-only.'

/**
 * Register the tool and its prompt line.
 * @param ctx - the plugin context; `tools`, `runtimeGraph` and `systemPrompt` are injected.
 */
export function apply(ctx: Context): void {
  contributeNode(ctx, { role: 'tool', tier: 'L1', label: 'Runtime graph inspector' })

  ctx.systemPrompt.section({
    name: 'tool:graph_inspect',
    order: 105,
    text: 'Use graph_inspect to see the plugin runtime you are running inside — which components are '
      + 'configured, which are live, which are disabled, and which are waiting on a dependency. '
      + 'It also answers who satisfies each dependency, in that component\'s own isolation realm, and how '
      + 'each component came up. Narrow it with entry_id, lifecycle or role; reading the whole tree at '
      + 'once is rarely what you want.',
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
      role: {
        type: 'array',
        items: { type: 'string', enum: ROLE_VALUES },
        description: "Keep only rows with these contributed roles. 'untyped' selects rows that contribute nothing.",
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
        ...args.role !== undefined ? { role: args.role.map(toRole) } : {},
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
