/**
 * The one place `FiberState` is mirrored.
 *
 * Cordis declares it as a `const enum`, so there is no runtime object to import
 * across a package boundary — upstream's `plugin-inventory` mirrors it by hand
 * the same way. Keeping the table in a module of its own means the projection
 * and the transition recorder cannot drift into two different tables.
 *
 * @module @se373/runtime-graph/lifecycle
 */

import type { LifecyclePhase } from './types.ts'

/** `FiberState` index → the lifecycle phase the projection reports. */
const LIFECYCLE: readonly LifecyclePhase[] = [
  'pending', // FiberState.PENDING
  'loading', // FiberState.LOADING
  'active', // FiberState.ACTIVE
  'failed', // FiberState.FAILED
  null, // FiberState.DISPOSED — no live root fiber, same as never mounted
  'unloading', // FiberState.UNLOADING
]

/**
 * Map a raw `FiberState` to its reported phase.
 * @param state - the numeric fiber state.
 * @returns the phase, or `null` for DISPOSED and for anything unrecognised.
 */
export function phaseOf(state: number): LifecyclePhase {
  return LIFECYCLE[state] ?? null
}
