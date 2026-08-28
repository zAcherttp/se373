/**
 * Fiber → loader row attribution, shared by everything that needs it.
 *
 * @module @se373/runtime-graph/attribute
 */
/**
 * Walk up from any fiber to the loader entry that owns it.
 *
 * A plugin that publishes its service from a child fiber still belongs to the
 * row the user wrote, so attribution has to climb rather than read `fiber.entry`
 * directly.
 * @param fiber - the fiber to attribute.
 * @returns the owning entry, or `undefined` for a fiber outside the loader tree.
 */
export function owningEntry(fiber) {
    let current = fiber;
    for (;;) {
        if (current.entry)
            return current.entry;
        const next = current.parent.fiber;
        if (next === current)
            return undefined;
        current = next;
    }
}
//# sourceMappingURL=attribute.js.map