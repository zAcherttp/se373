/**
 * The projection itself: loader entries and live fibers in, {@link
 * RuntimeGraphNode}s out.
 *
 * Kept separate from the service so the derivation is readable on its own, and
 * so a future push transport can reuse it without owning the service.
 *
 * @module @se373/runtime-graph/project
 */

import { Context, Inject } from '@se373/cordis'
import type { Fiber } from '@se373/cordis'
// Type-only: contributes `Fiber.entry` and `Context.loader` to the surface.
import type {} from '@se373/cordis-plugin-loader'
import type { Entry } from '@se373/cordis-plugin-loader'
import type {
  FunctionalKind,
  GraphJsonValue,
  LifecyclePhase,
  RuntimeGraphNode,
  StructuralKind,
} from './types.ts'

/**
 * Runtime mirror of Cordis's `FiberState`. It is a `const enum`, so it has no
 * runtime object to import across a package boundary; upstream's
 * `plugin-inventory` mirrors it the same way, and the two tables must agree.
 */
const LIFECYCLE: readonly LifecyclePhase[] = [
  'pending', // FiberState.PENDING
  'loading', // FiberState.LOADING
  'active', // FiberState.ACTIVE
  'failed', // FiberState.FAILED
  null, // FiberState.DISPOSED — no live root fiber, same as never mounted
  'unloading', // FiberState.UNLOADING
]

/** The effect label `ctx.tools.register()` attaches to its disposer. */
const TOOL_REGISTER_LABEL = 'tools.register()'

/** Guard against a config object that cycles or nests without bound. */
const MAX_CONFIG_DEPTH = 12

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
function sanitize(value: unknown, seen: Set<object>, depth = MAX_CONFIG_DEPTH): GraphJsonValue {
  if (value === null || value === undefined) return null
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value
    case 'number':
      return Number.isFinite(value) ? value : String(value)
    case 'bigint':
      return String(value)
    case 'function':
      return '[Function]'
    case 'symbol':
      return String(value)
    default:
      break
  }
  const object = value as object
  if (seen.has(object)) return '[Circular]'
  if (depth <= 0) return '[Truncated]'
  if (object instanceof Date) return object.toISOString()
  if (object instanceof RegExp || object instanceof Error) return String(object)
  seen.add(object)
  try {
    if (Array.isArray(object)) {
      return object.map(item => sanitize(item, seen, depth - 1))
    }
    const out: Record<string, GraphJsonValue> = {}
    for (const [key, item] of Object.entries(object)) {
      if (item === undefined) continue
      out[key] = sanitize(item, seen, depth - 1)
    }
    return out
  } finally {
    seen.delete(object)
  }
}

/**
 * Walk up from any fiber to the loader entry that owns it.
 *
 * A plugin that publishes its service from a child fiber still belongs to the
 * row the user wrote, so attribution has to climb rather than read `fiber.entry`
 * directly.
 * @param fiber - the fiber to attribute.
 * @returns the owning entry, or `undefined` for a fiber outside the loader tree.
 */
function owningEntry(fiber: Fiber): Entry | undefined {
  let current: Fiber = fiber
  for (;;) {
    if (current.entry) return current.entry
    const next = current.parent.fiber
    if (next === current) return undefined
    current = next
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
function realmOf(ctx: Context): string {
  const isolate = ctx[Context.isolate] as Record<string, symbol | undefined>
  const root = ctx.root[Context.isolate] as Record<string, symbol | undefined>
  const differing: string[] = []
  for (const name in isolate) {
    const symbol = isolate[name]
    if (symbol === undefined || symbol === root[name]) continue
    differing.push(symbol.description ?? name)
  }
  if (differing.length === 0) return 'root'
  return differing.sort().join(',')
}

/**
 * Whether this fiber's own effect tree contains a tool registration.
 * @param fiber - the entry's root fiber.
 * @returns true when the row registered at least one model-facing tool.
 */
function registersTools(fiber: Fiber): boolean {
  const stack = [...fiber.getEffects()]
  while (stack.length > 0) {
    const meta = stack.pop()
    if (meta === undefined) continue
    if (meta.label === TOOL_REGISTER_LABEL) return true
    stack.push(...meta.children)
  }
  return false
}

/** Normalize a plugin's static `provide` declaration to a name list. */
function declaredProvides(fiber: Fiber | undefined): string[] {
  const callback = fiber?.runtime?.callback as { provide?: string | string[] } | undefined
  const provide = callback?.provide
  if (provide === undefined) return []
  return Array.isArray(provide) ? [...provide] : [provide]
}

/** The structural axis, read from the loader row rather than from the plugin. */
function structuralOf(entry: Entry): StructuralKind {
  if (entry.options.group === true) return 'group'
  if (entry.subtree !== undefined) return 'include'
  return 'row'
}

/**
 * Build the live service-name index once per snapshot.
 *
 * Scanning `ctx.reflect.store` per entry would be quadratic; the tree is ~200
 * rows and the store is comparable, so one pass up front keeps a snapshot cheap
 * enough to take on every tool call.
 * @param ctx - any context in the tree; the reflect store is process-wide.
 * @returns entry id → service names that entry publishes.
 */
function liveProvidesByEntry(ctx: Context): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const store = ctx.reflect.store as Record<symbol, { name: string; fiber: Fiber } | undefined>
  for (const key of Reflect.ownKeys(store)) {
    if (typeof key !== 'symbol') continue
    const impl = store[key]
    if (impl?.fiber === undefined) continue
    const entry = owningEntry(impl.fiber)
    if (entry === undefined) continue
    const names = index.get(entry.id)
    if (names === undefined) index.set(entry.id, [impl.name])
    else if (!names.includes(impl.name)) names.push(impl.name)
  }
  return index
}

/**
 * Project one loader entry.
 * @param entry - the loader row to project.
 * @param live - the per-snapshot live-service index.
 * @returns the complete node.
 */
function projectEntry(entry: Entry, live: Map<string, string[]>): RuntimeGraphNode {
  const fiber = entry.fiber
  const enabled = !entry.disabled
  const mounted = fiber !== undefined && fiber.uid !== null

  // `fiber.inject` is the registry's own resolved declaration map, which already
  // merged the plugin's static `inject` with the row's. Reading the plugin
  // object instead would miss every object-shaped plugin, because the registry
  // keys those by their `apply` function and the declaration never travels with
  // it. A disabled row has no fiber, so its row-level `inject` is all there is.
  const injects = fiber === undefined
    ? Object.keys(Inject.resolve(entry.options.inject))
    : Object.keys(fiber.inject)
  // `fiber.store` is the snapshot of *resolved* implementations. A declared name
  // missing from it is exactly why the fiber is still PENDING, which is the
  // question a stuck node is opened to answer.
  const resolved = fiber?.store
  const unresolvedInjects = mounted && resolved !== undefined
    ? injects.filter(name => resolved[name] === undefined)
    : injects

  const provides = live.get(entry.id) ?? declaredProvides(fiber)

  let functional: FunctionalKind | null = null
  if (mounted && fiber !== undefined) {
    functional = provides.length > 0 ? 'provider' : registersTools(fiber) ? 'tools' : 'listener'
  }

  return {
    entryId: entry.id,
    parentEntryId: entry.parent.ctx.fiber.entry?.id ?? null,
    moduleName: entry.options.name,
    uid: fiber?.uid ?? null,
    realm: realmOf(entry.ctx),
    structural: structuralOf(entry),
    functional,
    lifecycle: fiber === undefined ? null : LIFECYCLE[fiber.state] ?? null,
    enabled,
    mounted,
    provides: [...provides].sort(),
    injects: injects.sort(),
    unresolvedInjects: [...unresolvedInjects].sort(),
    config: sanitize(mounted ? fiber?.config ?? entry.options.config : entry.options.config, new Set()),
  }
}

/**
 * Project the whole loader tree, in loader order.
 * @param ctx - a context with `ctx.loader` available.
 * @returns one node per configured entry, disabled rows included.
 */
export function projectTree(ctx: Context): RuntimeGraphNode[] {
  const live = liveProvidesByEntry(ctx)
  const nodes: RuntimeGraphNode[] = []
  for (const entry of ctx.loader.entries()) {
    nodes.push(projectEntry(entry, live))
  }
  return nodes
}
