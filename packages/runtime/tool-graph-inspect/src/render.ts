/**
 * Text rendering of a runtime-graph snapshot.
 *
 * Two shapes, chosen by result size rather than by a flag: a table when the
 * report covers many rows, and a full detail block when it covers one. A model
 * that asked about a single component wants its config, its edges and its
 * history; a model surveying 190 rows wants none of them.
 *
 * @module @se373/tool-graph-inspect/render
 */

import type { NodeTransition, RuntimeGraphNode, RuntimeGraphSnapshot } from '@se373/runtime-graph'

/** Longest config rendering kept inline in a detail block. */
const MAX_CONFIG_CHARS = 2000

/** Pad to a column width without truncating a value that overflows it. */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

/** The lifecycle cell, with `null` spelled out rather than blank. */
function phase(node: RuntimeGraphNode): string {
  if (node.lifecycle !== null) return node.lifecycle
  return node.enabled ? 'not-live' : 'disabled'
}

/** One-line census, so a narrowed report cannot read as a complete one. */
function summarize(snapshot: RuntimeGraphSnapshot): string {
  const counts = new Map<string, number>()
  for (const node of snapshot.nodes) {
    const key = phase(node)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const census = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key} ${count}`)
    .join(' · ')
  const scope = snapshot.nodes.length === snapshot.totalNodes
    ? `${snapshot.totalNodes} rows`
    : `${snapshot.nodes.length} of ${snapshot.totalNodes} rows`
  return census.length > 0 ? `${scope} — ${census}` : scope
}

/** The contributed semantics, or a plain statement that there are none. */
function semantics(node: RuntimeGraphNode): string {
  if (node.role === null && node.tier === null && node.label === null) {
    return 'untyped (this package contributes nothing to graph/node)'
  }
  return [
    node.role ?? 'role unstated',
    node.tier === null ? null : `tier ${node.tier}`,
    node.label === null ? null : `"${node.label}"`,
  ].filter(part => part !== null).join(' · ')
}

/** Wall-clock time of a transition, to the millisecond — boot happens fast. */
function clock(at: number): string {
  return new Date(at).toISOString().slice(11, 23)
}

/** One transition line. */
function transitionLine(transition: NodeTransition): string {
  const from = transition.from ?? 'none'
  const to = transition.to ?? 'none'
  return `    ${pad(`${from} → ${to}`, 22)} at ${clock(transition.at)}  sn ${transition.sn}`
}

/** The full block for a single selected component. */
function renderDetail(node: RuntimeGraphNode): string {
  const lines = [
    `${node.entryId}  (${node.moduleName})`,
    `  lifecycle       ${phase(node)}${node.uid === null ? '' : `  uid ${node.uid}`}`,
    `  structural      ${node.structural}`,
    `  functional      ${node.functional ?? 'unknown (not mounted)'}`,
    `  semantics       ${semantics(node)}`,
    `  enabled         ${node.enabled}`,
    `  realm           ${node.realm}`,
    `  parent          ${node.parentEntryId ?? '(root tree)'}`,
    `  provides        ${node.provides.join(', ') || '(none)'}`,
  ]

  if (node.edges.length === 0) {
    lines.push('  injects         (none)')
  } else {
    lines.push(`  injects         resolved in realm ${node.realm}`)
    const width = Math.max(...node.edges.map(edge => edge.service.length))
    for (const edge of node.edges) {
      const target = !edge.satisfied
        ? 'UNSATISFIED'
        : edge.providerEntryId === null
          ? `(root) ${edge.providerName ?? ''}`.trim()
          : `${edge.providerEntryId}  (${edge.providerName ?? '?'})`
      lines.push(`    ${pad(edge.service, width)}  ← ${target}`)
    }
  }
  if (node.mounted && node.unresolvedInjects.length > 0) {
    lines.push(`  waiting on      ${node.unresolvedInjects.join(', ')}`)
  }

  // Named for what they are on every rendering. A transition list and the log
  // can legitimately disagree — the log is filtered and the ring overflows —
  // and unlabelled that reads as invented history.
  lines.push('  transitions     observed fiber state changes, not log lines;')
  lines.push('                  sn is the log sequence watermark at capture')
  if (node.transitions.length === 0) {
    lines.push('    (none observed since the runtime-graph row mounted)')
  } else {
    lines.push(...node.transitions.map(transitionLine))
  }

  const config = JSON.stringify(node.config, null, 2)
  lines.push('  config')
  lines.push(
    config.length > MAX_CONFIG_CHARS
      ? `${config.slice(0, MAX_CONFIG_CHARS)}\n… config truncated at ${MAX_CONFIG_CHARS} characters`
      : config.split('\n').map(line => `    ${line}`).join('\n'),
  )
  return lines.join('\n')
}

/**
 * Render a snapshot for the model.
 * @param snapshot - the canonical value produced by `ctx.runtimeGraph.snapshot()`.
 * @returns plain text; a detail block for one node, otherwise a table.
 */
export function renderSnapshot(snapshot: RuntimeGraphSnapshot): string {
  if (snapshot.nodes.length === 0) return `${summarize(snapshot)}\n(no rows matched)`
  const first = snapshot.nodes[0]
  if (snapshot.nodes.length === 1 && first !== undefined) {
    return `${summarize(snapshot)}\n\n${renderDetail(first)}`
  }

  const idWidth = Math.max(2, ...snapshot.nodes.map(node => node.entryId.length))
  const moduleWidth = Math.max(6, ...snapshot.nodes.map(node => node.moduleName.length))
  const rows = [
    `${pad('ID', idWidth)}  ${pad('LIFECYCLE', 9)}  ${pad('STRUCT', 7)}  ${pad('FUNC', 8)}  `
    + `${pad('ROLE', 8)}  ${pad('MODULE', moduleWidth)}  PROVIDES`,
  ]
  for (const node of snapshot.nodes) {
    rows.push(
      `${pad(node.entryId, idWidth)}  ${pad(phase(node), 9)}  ${pad(node.structural, 7)}  `
      + `${pad(node.functional ?? '-', 8)}  ${pad(node.role ?? '-', 8)}  `
      + `${pad(node.moduleName, moduleWidth)}  ${node.provides.join(' ')}`,
    )
  }

  // Unsatisfied edges, not unresolved injects: this is the realm-aware answer,
  // and it covers rows that are not mounted at all — which is where a wrong
  // realm shows up first.
  const starved = snapshot.nodes
    .map(node => ({ node, missing: node.edges.filter(edge => !edge.satisfied) }))
    .filter(({ node, missing }) => missing.length > 0 && node.enabled)
  if (starved.length > 0) {
    rows.push('', 'injections that nothing satisfies in the requesting row\'s realm:')
    for (const { node, missing } of starved) {
      rows.push(`  ${node.entryId} → ${missing.map(edge => edge.service).join(', ')}`)
    }
  }

  const isolated = snapshot.nodes.filter(node => node.realm !== 'root')
  if (isolated.length > 0) {
    rows.push('', 'rows resolving in a non-root isolation realm:')
    for (const node of isolated) {
      rows.push(`  ${node.entryId} → ${node.realm}`)
    }
  }

  rows.push('', 'Pass entry_id to see one row in full: its edges, its transitions and its resolved config.')
  return `${summarize(snapshot)}\n\n${rows.join('\n')}`
}
