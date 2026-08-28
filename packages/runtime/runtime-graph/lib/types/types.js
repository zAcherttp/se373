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
export const STRUCTURAL_KINDS = ['row', 'group', 'include'];
/**
 * Functional axis: what the row contributes once it is running. Never changes
 * after mount, and is `null` before it — an unmounted row has contributed
 * nothing yet, and claiming otherwise would be an inference, not an observation.
 *
 * - `provider` — publishes at least one service onto the context.
 * - `tools` — registers model-facing tools but publishes no service.
 * - `listener` — neither; it only listens, or contributes prompt sections.
 */
export const FUNCTIONAL_KINDS = ['provider', 'tools', 'listener'];
/**
 * Lifecycle axis: where the row's root fiber is right now. Changes constantly.
 *
 * `null` means there is no live root fiber at all — a disabled row, a row whose
 * fiber has been disposed, or one that has not started yet. That is the same
 * projection upstream's `pluginInventory` uses for `DISPOSED`, so the two agree.
 */
export const LIFECYCLE_PHASES = ['pending', 'loading', 'active', 'failed', 'unloading'];
/**
 * Semantic role: what a package *means* in the architecture.
 *
 * Unlike the three axes above this cannot be derived — nothing observable
 * distinguishes a seam from an ordinary provider — so it is contributed through
 * the `graph/node` waterfall, and is `null` for every package that contributes
 * nothing.
 *
 * - `seam` — a swappable stage; the thing invariant I3 says is a config-row edit.
 * - `provider` — publishes a service that is not a seam.
 * - `core` — infrastructure with no second implementation possible.
 * - `tool` — registers model-facing tools.
 */
export const NODE_ROLES = ['seam', 'provider', 'core', 'tool'];
//# sourceMappingURL=types.js.map