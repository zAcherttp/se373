/**
 * The wire-shaped payload of one runtime-graph snapshot.
 *
 * Kept in its own module because every consumer — the `graph_inspect` tool, the
 * phase-4 board, the phase-6c pipeline graph — imports the types without
 * importing the projection. Nothing here depends on Cordis.
 *
 * @module @se373/runtime-graph/types
 */

/**
 * Structural axis: what kind of loader row this is. Changes on a config edit.
 *
 * - `row` — an ordinary plugin row.
 * - `group` — a `cordis:group` row that owns child rows.
 * - `include` — a row whose plugin mounted a nested entry tree (another file).
 */
export const STRUCTURAL_KINDS = ['row', 'group', 'include'] as const

/** Structural axis values; see {@link STRUCTURAL_KINDS} for the vocabulary. */
export type StructuralKind = (typeof STRUCTURAL_KINDS)[number]

/**
 * Functional axis: what the row contributes once it is running. Never changes
 * after mount, and is `null` before it — an unmounted row has contributed
 * nothing yet, and claiming otherwise would be an inference, not an observation.
 *
 * - `provider` — publishes at least one service onto the context.
 * - `tools` — registers model-facing tools but publishes no service.
 * - `listener` — neither; it only listens, or contributes prompt sections.
 */
export const FUNCTIONAL_KINDS = ['provider', 'tools', 'listener'] as const

/** Functional axis values; see {@link FUNCTIONAL_KINDS} for the vocabulary. */
export type FunctionalKind = (typeof FUNCTIONAL_KINDS)[number]

/**
 * Lifecycle axis: where the row's root fiber is right now. Changes constantly.
 *
 * `null` means there is no live root fiber at all — a disabled row, a row whose
 * fiber has been disposed, or one that has not started yet. That is the same
 * projection upstream's `pluginInventory` uses for `DISPOSED`, so the two agree.
 */
export const LIFECYCLE_PHASES = ['pending', 'loading', 'active', 'failed', 'unloading'] as const

/**
 * Lifecycle axis values, plus `null` for "no live root fiber".
 *
 * The three vocabularies are exported as value tuples, not just as unions,
 * because a consumer that must restate them — the `graph_inspect` output schema
 * is the one that does — otherwise restates them by hand, and a phase added here
 * would leave that consumer silently narrow.
 */
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number] | null

/** JSON-safe value: what survives the sanitizer applied to resolved config. */
export type GraphJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GraphJsonValue[]
  | { readonly [key: string]: GraphJsonValue }

/**
 * One loader entry, projected. Every configured row appears — including a row
 * that is `disabled: true` and therefore has no fiber at all, because you
 * cannot turn on what you cannot see.
 *
 * The payload is deliberately complete: selecting a node must not require a
 * second call to answer what a click could ask.
 */
export interface RuntimeGraphNode {
  /** Loader entry id, unique across the tree (nested ids are `parent:child`). */
  readonly entryId: string
  /** The enclosing entry's id, or `null` for a row in the root tree. */
  readonly parentEntryId: string | null
  /** Module specifier the loader imports for this row. */
  readonly moduleName: string
  /** The root fiber's registry uid, or `null` when no fiber is live. */
  readonly uid: number | null
  /**
   * Opaque identity of the service-isolation realm this row resolves in.
   *
   * `'root'` for the ordinary realm. Otherwise a sorted, stable description of
   * every service name whose implementation this row would resolve to a
   * *different* provider than the root context would — which is exactly what
   * distinguishes two A/B pipelines publishing the same service name.
   */
  readonly realm: string
  /** Structural axis — see {@link StructuralKind}. */
  readonly structural: StructuralKind
  /** Functional axis — see {@link FunctionalKind}; `null` until mounted. */
  readonly functional: FunctionalKind | null
  /** Lifecycle axis — see {@link LifecyclePhase}. */
  readonly lifecycle: LifecyclePhase
  /** Effective enablement, including a disabled ancestor group. */
  readonly enabled: boolean
  /** Whether a live root fiber exists. `false` with `enabled: true` means starting, or failed away. */
  readonly mounted: boolean
  /**
   * Service names this row publishes. Read from the live service store when the
   * row is mounted; falls back to the plugin's static `provide` declaration
   * otherwise. Empty for a row whose module was never imported.
   */
  readonly provides: readonly string[]
  /** Declared dependency names, merged from the config row and the plugin's static `inject`. */
  readonly injects: readonly string[]
  /**
   * The subset of {@link injects} that is currently unresolved. This is why a
   * node sits in `pending`, and it is the one question the board is opened to
   * ask most often, so it travels with the node rather than behind a second call.
   */
  readonly unresolvedInjects: readonly string[]
  /**
   * Config as the fiber received it — validated and schema-defaulted when the
   * row is mounted, raw from the config file when it is not. Sanitized to JSON:
   * a `!!js` expression that resolved to a function reads as `"[Function]"`.
   */
  readonly config: GraphJsonValue
}

/** A point-in-time projection of the whole loader tree. */
export interface RuntimeGraphSnapshot {
  /** Wall-clock time the snapshot was taken. */
  readonly capturedAt: number
  /** Every node matching the query, in loader order. */
  readonly nodes: readonly RuntimeGraphNode[]
  /** How many nodes the tree holds in total, before the query narrowed it. */
  readonly totalNodes: number
}

/**
 * Narrowing applied while projecting. Every field is optional, and an omitted
 * field filters nothing — a bare `snapshot()` is the whole tree.
 *
 * Narrowing exists so that inspecting a 187-row tree is not all-or-nothing.
 */
export interface RuntimeGraphQuery {
  /**
   * Keep only this entry and everything beneath it (its group children, its
   * included subtree, recursively).
   */
  readonly entryId?: string
  /** Keep only nodes in one of these lifecycle phases. `null` selects rows with no live fiber. */
  readonly lifecycle?: readonly LifecyclePhase[]
  /** Keep only rows that are (or are not) effectively enabled. */
  readonly enabled?: boolean
}
