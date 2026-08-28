/**
 * Text rendering of a runtime-graph snapshot.
 *
 * Two shapes, chosen by result size rather than by a flag: a table when the
 * report covers many rows, and a full detail block when it covers one. A model
 * that asked about a single component wants its config; a model surveying 190
 * rows wants none of them.
 *
 * @module @se373/tool-graph-inspect/render
 */

import type { RuntimeGraphNode, RuntimeGraphSnapshot } from '@se373/runtime-graph'

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

/** The full block for a single selected component. */
function renderDetail(node: RuntimeGraphNode): string {
  const lines = [
    `${node.entryId}  (${node.moduleName})`,
    `  lifecycle       ${phase(node)}${node.uid === null ? '' : `  uid ${node.uid}`}`,
    `  structural      ${node.structural}`,
    `  functional      ${node.functional ?? 'unknown (not mounted)'}`,
    `  enabled         ${node.enabled}`,
    `  realm           ${node.realm}`,
    `  parent          ${node.parentEntryId ?? '(root tree)'}`,
    `  provides        ${node.provides.join(', ') || '(none)'}`,
    `  injects         ${node.injects.join(', ') || '(none)'}`,
  ]
  if (node.unresolvedInjects.length > 0) {
    lines.push(`  waiting on      ${node.unresolvedInjects.join(', ')}`)
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
    `${pad('ID', idWidth)}  ${pad('LIFECYCLE', 9)}  ${pad('STRUCT', 7)}  ${pad('FUNC', 8)}  ${pad('MODULE', moduleWidth)}  PROVIDES`,
  ]
  for (const node of snapshot.nodes) {
    rows.push(
      `${pad(node.entryId, idWidth)}  ${pad(phase(node), 9)}  ${pad(node.structural, 7)}  `
      + `${pad(node.functional ?? '-', 8)}  ${pad(node.moduleName, moduleWidth)}  ${node.provides.join(' ')}`,
    )
  }

  const waiting = snapshot.nodes.filter(node => node.mounted && node.unresolvedInjects.length > 0)
  if (waiting.length > 0) {
    rows.push('', 'waiting on unresolved dependencies:')
    for (const node of waiting) {
      rows.push(`  ${node.entryId} → ${node.unresolvedInjects.join(', ')}`)
    }
  }

  const isolated = snapshot.nodes.filter(node => node.realm !== 'root')
  if (isolated.length > 0) {
    rows.push('', 'rows resolving in a non-root isolation realm:')
    for (const node of isolated) {
      rows.push(`  ${node.entryId} → ${node.realm}`)
    }
  }

  rows.push('', 'Pass entry_id to see one row in full, including its resolved config.')
  return `${summarize(snapshot)}\n\n${rows.join('\n')}`
}
