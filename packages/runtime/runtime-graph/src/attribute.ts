/**
 * Fiber → loader row attribution, shared by everything that needs it.
 *
 * @module @se373/runtime-graph/attribute
 */

import type { Fiber } from '@se373/cordis'
// Type-only: contributes `Fiber.entry`.
import type {} from '@se373/cordis-plugin-loader'
import type { Entry } from '@se373/cordis-plugin-loader'

/**
 * Walk up from any fiber to the loader entry that owns it.
 *
 * A plugin that publishes its service from a child fiber still belongs to the
 * row the user wrote, so attribution has to climb rather than read `fiber.entry`
 * directly.
 * @param fiber - the fiber to attribute.
 * @returns the owning entry, or `undefined` for a fiber outside the loader tree.
 */
export function owningEntry(fiber: Fiber): Entry | undefined {
  let current: Fiber = fiber
  for (;;) {
    if (current.entry) return current.entry
    const next = current.parent.fiber
    if (next === current) return undefined
    current = next
  }
}
