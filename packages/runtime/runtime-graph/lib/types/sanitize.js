/**
 * Reducing an arbitrary config value to something that survives JSON.
 *
 * Its own module because it is the one piece of the projection with no
 * dependency on Cordis at all, and the one that must never throw: it runs
 * inside every snapshot, over config a `!!js` row can fill with anything.
 *
 * @module @se373/runtime-graph/sanitize
 */
/** Guard against a config object that cycles or nests without bound. */
const MAX_CONFIG_DEPTH = 12;
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
export function sanitize(value, seen, depth = MAX_CONFIG_DEPTH) {
    if (value === null || value === undefined)
        return null;
    switch (typeof value) {
        case 'boolean':
        case 'string':
            return value;
        case 'number':
            return Number.isFinite(value) ? value : String(value);
        case 'bigint':
            return String(value);
        case 'function':
            return '[Function]';
        case 'symbol':
            return String(value);
        default:
            break;
    }
    const object = value;
    if (seen.has(object))
        return '[Circular]';
    if (depth <= 0)
        return '[Truncated]';
    if (object instanceof Date)
        return object.toISOString();
    if (object instanceof RegExp || object instanceof Error)
        return String(object);
    seen.add(object);
    try {
        if (Array.isArray(object)) {
            return object.map(item => sanitize(item, seen, depth - 1));
        }
        const out = {};
        // Read each property on its own, because reading one can throw. A `!!js`
        // row can put a Cordis context in config, and a context proxy throws on an
        // unresolved service name -- so `Object.entries` over the whole object
        // would take the snapshot down with it, and with it the board and
        // `graph_inspect`. A value we cannot read is labelled, like every other
        // value we cannot carry.
        for (const key of Object.keys(object)) {
            let item;
            try {
                item = object[key];
            }
            catch {
                out[key] = '[Unreadable]';
                continue;
            }
            if (item === undefined)
                continue;
            out[key] = sanitize(item, seen, depth - 1);
        }
        return out;
    }
    finally {
        seen.delete(object);
    }
}
//# sourceMappingURL=sanitize.js.map