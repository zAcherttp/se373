/**
 * Fiber → loader row attribution, shared by everything that needs it.
 *
 * @module @se373/runtime-graph/attribute
 */
import type { Fiber } from '@se373/cordis';
import type { Entry } from '@se373/cordis-plugin-loader';
/**
 * Walk up from any fiber to the loader entry that owns it.
 *
 * A plugin that publishes its service from a child fiber still belongs to the
 * row the user wrote, so attribution has to climb rather than read `fiber.entry`
 * directly.
 * @param fiber - the fiber to attribute.
 * @returns the owning entry, or `undefined` for a fiber outside the loader tree.
 */
export declare function owningEntry(fiber: Fiber): Entry | undefined;
//# sourceMappingURL=attribute.d.ts.map