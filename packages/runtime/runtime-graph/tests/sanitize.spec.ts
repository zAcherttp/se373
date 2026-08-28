/**
 * The sanitizer runs inside every snapshot, over config a `!!js` row can fill
 * with anything. Its contract is therefore narrower than "produces JSON": it
 * must never throw, and it must not lose a value silently where a label would
 * do.
 */

import { describe, expect, it } from 'vitest'
import { sanitize } from '../src/sanitize.ts'

/** Sanitize with a fresh cycle set, the way the projection calls it. */
function clean(value: unknown): unknown {
  return sanitize(value, new Set())
}

describe('sanitize', () => {
  it('labels a cycle instead of recursing into it', () => {
    const looped: Record<string, unknown> = { name: 'root' }
    looped['self'] = looped
    looped['nested'] = { back: looped }
    expect(clean(looped)).toEqual({ name: 'root', self: '[Circular]', nested: { back: '[Circular]' } })
  })

  it('re-enters a value that merely repeats, since a DAG is not a cycle', () => {
    // The cycle set is unwound on the way out, so a shared child appears in
    // full at each site rather than being labelled the second time.
    const shared = { id: 1 }
    expect(clean({ a: shared, b: shared })).toEqual({ a: { id: 1 }, b: { id: 1 } })
  })

  it('cuts unbounded nesting rather than overflowing the stack', () => {
    let deep: Record<string, unknown> = { end: true }
    for (let level = 0; level < 200; level++) deep = { deep }
    expect(JSON.stringify(clean(deep))).toContain('[Truncated]')
  })

  it('labels what JSON cannot carry', () => {
    // Each of these reaches config through a `!!js` expression, and each would
    // otherwise be dropped or throw.
    expect(clean({ fn: () => 1 })).toEqual({ fn: '[Function]' })
    expect(clean({ big: 10n })).toEqual({ big: '10' })
    expect(clean({ sym: Symbol('x') })).toEqual({ sym: 'Symbol(x)' })
    expect(clean({ nan: Number.NaN, inf: Number.POSITIVE_INFINITY })).toEqual({ nan: 'NaN', inf: 'Infinity' })
    expect(clean({ when: new Date(0) })).toEqual({ when: '1970-01-01T00:00:00.000Z' })
    expect(clean({ boom: new Error('nope') })).toEqual({ boom: 'Error: nope' })
    expect(clean({ re: /a+/g })).toEqual({ re: '/a+/g' })
  })

  it('omits undefined properties but keeps null ones', () => {
    // `undefined` has no JSON spelling; `null` is a value the config stated.
    expect(clean({ a: undefined, b: null })).toEqual({ b: null })
  })

  it('survives a property that throws when read', () => {
    // Not hypothetical: a `!!js` row can put a Cordis context in config, and a
    // context proxy throws on an unresolved service name. A snapshot that threw
    // would take `graph_inspect` and the board down with it, so an unreadable
    // property is labelled like every other value that cannot be carried.
    const hostile = {
      fine: 1,
      get boom(): never { throw new Error('do not read me') },
      alsoFine: 2,
    }
    expect(clean(hostile)).toEqual({ fine: 1, boom: '[Unreadable]', alsoFine: 2 })
  })
})
