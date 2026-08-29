/**
 * Reducing an arbitrary config value to something that survives JSON.
 *
 * Its own module because it is the one piece of the projection with no
 * dependency on Cordis at all, and the one that must never throw: it runs
 * inside every snapshot, over config a `!!js` row can fill with anything.
 *
 * @module @se373/runtime-graph/sanitize
 */
import type { GraphJsonValue } from './types.ts';
/**
 * Reduce an arbitrary config value to something that survives JSON.
 *
 * A `!!js` row can put a function, a service handle, or a cyclic object into
 * config; the projection has to be sendable, so those become labels rather than
 * throwing or silently dropping the field.
 * @param value - the value to sanitize.
 * @param seen - objects already on the current path, for cycle detection.
 * @param depth - remaining nesting budget.
 * @returns a JSON-safe projection of `value`.
 */
export declare function sanitize(value: unknown, seen: Set<object>, depth?: number): GraphJsonValue;
//# sourceMappingURL=sanitize.d.ts.map