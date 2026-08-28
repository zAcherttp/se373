/**
 * The projection itself: loader entries and live fibers in, {@link
 * RuntimeGraphNode}s out.
 *
 * Kept separate from the service so the derivation is readable on its own, and
 * so a future push transport can reuse it without owning the service.
 *
 * @module @se373/runtime-graph/project
 */
import { Context, Inject } from '@se373/cordis';
import { owningEntry } from "./attribute.js";
import { phaseOf } from "./lifecycle.js";
import { NODE_ROLES } from "./types.js";
/** The effect label `ctx.tools.register()` attaches to its disposer. */
const TOOL_REGISTER_LABEL = 'tools.register()';
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
function sanitize(value, seen, depth = MAX_CONFIG_DEPTH) {
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
        for (const [key, item] of Object.entries(object)) {
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
/**
 * Every service name this context resolves differently from the root context.
 *
 * This is the realm, expressed as one opaque string. `fiber.inject` yields a
 * service *name*; which implementation that name reaches is realm-dependent, so
 * an A/B pair publishing the same name in two realms must be distinguishable on
 * the node itself. Carrying it from day one is cheap; retrofitting it would mean
 * changing the payload, the transport, the edge algorithm, and every consumer,
 * and until then the failure is silent — one plausible edge drawn for two
 * different pipelines.
 * @param ctx - the entry's context.
 * @returns a sorted, stable realm label; `'root'` for the ordinary realm.
 */
function realmOf(ctx) {
    const isolate = ctx[Context.isolate];
    const root = ctx.root[Context.isolate];
    const differing = [];
    for (const name in isolate) {
        const symbol = isolate[name];
        if (symbol === undefined || symbol === root[name])
            continue;
        differing.push(symbol.description ?? name);
    }
    if (differing.length === 0)
        return 'root';
    return differing.sort().join(',');
}
/**
 * Resolve one declared injection the way the requesting row itself would.
 *
 * This is the whole realm-awareness argument in three lines: the service name
 * is turned into a symbol **through the requesting context's own isolate map**,
 * and only then looked up. Two rows in two realms declaring the same name reach
 * two different symbols and therefore two different providers, which is exactly
 * what an A/B comparison needs and exactly what a name-keyed lookup would erase.
 * @param entry - the row doing the injecting.
 * @param store - the process-wide service store.
 * @param name - the declared service name.
 * @returns the edge, satisfied or not.
 */
function resolveEdge(entry, store, name) {
    const isolate = entry.ctx[Context.isolate];
    const key = isolate[name];
    const impl = key === undefined ? undefined : store[key];
    // Matches `ReflectService._getImpl(name, true)`: a provider that exists but is
    // not ACTIVE does not satisfy anyone, which is why a dependent sits pending
    // while its provider is still loading.
    if (impl === undefined || phaseOf(impl.fiber.state) !== 'active') {
        return { service: name, satisfied: false, providerEntryId: null, providerName: null };
    }
    return {
        service: name,
        satisfied: true,
        // Null here means root-provided, not unsatisfied — `logger`, `timer` and
        // the loader itself belong to no row.
        providerEntryId: owningEntry(impl.fiber)?.id ?? null,
        providerName: impl.fiber.name,
    };
}
/**
 * Whether this fiber's own effect tree contains a tool registration.
 * @param fiber - the entry's root fiber.
 * @returns true when the row registered at least one model-facing tool.
 */
function registersTools(fiber) {
    const stack = [...fiber.getEffects()];
    while (stack.length > 0) {
        const meta = stack.pop();
        if (meta === undefined)
            continue;
        if (meta.label === TOOL_REGISTER_LABEL)
            return true;
        stack.push(...meta.children);
    }
    return false;
}
/** Normalize a plugin's static `provide` declaration to a name list. */
function declaredProvides(fiber) {
    const callback = fiber?.runtime?.callback;
    const provide = callback?.provide;
    if (provide === undefined)
        return [];
    return Array.isArray(provide) ? [...provide] : [provide];
}
/** The structural axis, read from the loader row rather than from the plugin. */
function structuralOf(entry) {
    if (entry.options.group === true)
        return 'group';
    if (entry.subtree !== undefined)
        return 'include';
    return 'row';
}
/**
 * Build the live service-name index once per snapshot.
 *
 * Scanning `ctx.reflect.store` per entry would be quadratic; the tree is ~200
 * rows and the store is comparable, so one pass up front keeps a snapshot cheap
 * enough to take on every tool call.
 * @param store - the process-wide service store.
 * @returns entry id → service names that entry publishes.
 */
function liveProvidesByEntry(store) {
    const index = new Map();
    for (const key of Reflect.ownKeys(store)) {
        if (typeof key !== 'symbol')
            continue;
        const impl = store[key];
        if (impl?.fiber === undefined)
            continue;
        const entry = owningEntry(impl.fiber);
        if (entry === undefined)
            continue;
        const names = index.get(entry.id);
        if (names === undefined)
            index.set(entry.id, [impl.name]);
        else if (!names.includes(impl.name))
            names.push(impl.name);
    }
    return index;
}
/**
 * Take only what a package is allowed to say.
 *
 * The acceptance rule is "a package may say what it means, never what it is",
 * and this is where that stops being a convention. Rather than merging the
 * waterfall's result and hoping no listener overwrote `lifecycle`, the three
 * semantic fields are picked out and everything else is discarded — so a
 * misbehaving listener cannot corrupt the projection even deliberately.
 * @param contributed - whatever the waterfall returned.
 * @returns the contribution, with anything unrecognised dropped.
 */
function pickContribution(contributed) {
    return {
        role: NODE_ROLES.includes(contributed.role) ? contributed.role : null,
        tier: typeof contributed.tier === 'string' ? contributed.tier : null,
        label: typeof contributed.label === 'string' ? contributed.label : null,
    };
}
/**
 * Project one loader entry.
 * @param entry - the loader row to project.
 * @param live - the per-snapshot live-service index.
 * @param store - the process-wide service store.
 * @param transitions - the lifecycle history recorder, when one is running.
 * @returns the complete node, before the waterfall runs.
 */
function projectEntry(entry, live, store, transitions) {
    const fiber = entry.fiber;
    const enabled = !entry.disabled;
    const mounted = fiber !== undefined && fiber.uid !== null;
    // `fiber.inject` is the registry's own resolved declaration map, which already
    // merged the plugin's static `inject` with the row's. Reading the plugin
    // object instead would miss every object-shaped plugin, because the registry
    // keys those by their `apply` function and the declaration never travels with
    // it. A disabled row has no fiber, so its row-level `inject` is all there is.
    const injects = fiber === undefined
        ? Object.keys(Inject.resolve(entry.options.inject))
        : Object.keys(fiber.inject);
    // `fiber.store` is the snapshot of *resolved* implementations. A declared name
    // missing from it is exactly why the fiber is still PENDING, which is the
    // question a stuck node is opened to answer.
    const resolved = fiber?.store;
    const unresolvedInjects = mounted && resolved !== undefined
        ? injects.filter(name => resolved[name] === undefined)
        : injects;
    const provides = live.get(entry.id) ?? declaredProvides(fiber);
    let functional = null;
    if (mounted && fiber !== undefined) {
        functional = provides.length > 0 ? 'provider' : registersTools(fiber) ? 'tools' : 'listener';
    }
    return {
        entryId: entry.id,
        parentEntryId: entry.parent.ctx.fiber.entry?.id ?? null,
        moduleName: entry.options.name,
        uid: fiber?.uid ?? null,
        realm: realmOf(entry.ctx),
        structural: structuralOf(entry),
        functional,
        lifecycle: fiber === undefined ? null : phaseOf(fiber.state),
        enabled,
        mounted,
        provides: [...provides].sort(),
        injects: injects.sort(),
        unresolvedInjects: [...unresolvedInjects].sort(),
        edges: injects.map(name => resolveEdge(entry, store, name)),
        transitions: transitions?.get(entry.id) ?? [],
        role: null,
        tier: null,
        label: null,
        config: sanitize(mounted ? fiber?.config ?? entry.options.config : entry.options.config, new Set()),
    };
}
/**
 * Project the whole loader tree, in loader order.
 * @param ctx - a context with `ctx.loader` available.
 * @param transitions - the lifecycle history recorder, when one is running.
 * @returns one node per configured entry, disabled rows included.
 */
export function projectTree(ctx, transitions) {
    const store = ctx.reflect.store;
    const live = liveProvidesByEntry(store);
    const nodes = [];
    for (const entry of ctx.loader.entries()) {
        const derived = projectEntry(entry, live, store, transitions);
        // The waterfall is offered every node. A package with nothing to say never
        // registered a listener, and the chain collapses to `next()`.
        const contributed = ctx.waterfall('graph/node', derived, () => derived);
        nodes.push({ ...derived, ...pickContribution(contributed) });
    }
    return nodes;
}
//# sourceMappingURL=project.js.map