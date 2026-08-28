/**
 * The wire shape of a board snapshot.
 *
 * Structurally `RuntimeGraphSnapshot`, restated here in mutable, non-branded
 * form because the typert analyzer reflects these declarations into a Zod codec
 * and a `readonly` array is not something it can construct on the far side. The
 * projection stays the single source of the *meaning*; this is its wire cast.
 *
 * @module @se373/board-gateway/types
 */

import type {
  FunctionalKind,
  GraphJsonValue,
  LifecyclePhase,
  NodeRole,
  StructuralKind,
} from '@se373/runtime-graph'

/** One resolved dependency, as it crosses the wire. */
export interface BoardEdge {
  /** The declared service name. */
  service: string
  /** Whether the name reaches a live provider in this node's realm. */
  satisfied: boolean
  /** The providing row, or null when unsatisfied or root-provided. */
  providerEntryId: string | null
  /** The providing fiber's display name, or null when unsatisfied. */
  providerName: string | null
}

/** One observed lifecycle change, as it crosses the wire. */
export interface BoardTransition {
  /** The phase left behind. */
  from: LifecyclePhase
  /** The phase entered. */
  to: LifecyclePhase
  /** Wall-clock time of the change. */
  at: number
  /** The log's sequence number at capture. */
  sn: number
}

/** One loader row, as it crosses the wire. */
export interface BoardNode {
  /** Loader entry id, unique across the tree. */
  entryId: string
  /** The enclosing entry's id, or null for a row in the root tree. */
  parentEntryId: string | null
  /** Module specifier the loader imports for this row. */
  moduleName: string
  /** The root fiber's registry uid, or null when no fiber is live. */
  uid: number | null
  /** Opaque identity of the service-isolation realm this row resolves in. */
  realm: string
  /** Structural axis. */
  structural: StructuralKind
  /** Functional axis; null until the row mounts. */
  functional: FunctionalKind | null
  /** Lifecycle axis; null when no live root fiber exists. */
  lifecycle: LifecyclePhase
  /** Effective enablement, including a disabled ancestor group. */
  enabled: boolean
  /** Whether a live root fiber exists. */
  mounted: boolean
  /** Service names this row publishes. */
  provides: string[]
  /** Declared dependency names. */
  injects: string[]
  /** The subset of `injects` this row's own fiber has not resolved. */
  unresolvedInjects: string[]
  /** One entry per declared injection, resolved in this row's realm. */
  edges: BoardEdge[]
  /** Observed lifecycle history, oldest first. */
  transitions: BoardTransition[]
  /** Contributed semantic role, or null for a package that contributes nothing. */
  role: NodeRole | null
  /** Contributed architectural tier, or null. */
  tier: string | null
  /** Contributed display label, or null. */
  label: string | null
  /** Resolved config, sanitized to JSON. */
  config: GraphJsonValue
}

/** A point-in-time projection of the whole loader tree. */
export interface BoardSnapshot {
  /** Wall-clock time the snapshot was taken. */
  capturedAt: number
  /** Rows in the whole tree, before any narrowing. */
  totalNodes: number
  /** Every node, in loader order. */
  nodes: BoardNode[]
}
