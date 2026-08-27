import { describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import InvariantRegistry, { InvariantError } from '../src/index.ts'
import type { InvariantInstaller } from '../src/index.ts'

/** Mount a registry with the given config and return its context. */
async function mount(config: Record<string, unknown> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry, config)
  return ctx
}

describe('InvariantRegistry', () => {
  it('runs an installer and exposes a package-attributed failure reporter', async () => {
    const ctx = await mount()
    let reported: unknown
    const check: InvariantInstaller = (_ctx, fail) => {
      try {
        fail('contract broken')
      } catch (error) {
        reported = error
      }
    }

    ctx.invariants.register('@se373/probe', check)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(reported).toBeInstanceOf(InvariantError)
    const error = reported as InvariantError
    expect(error.code).toBe('INVARIANT')
    expect(error.packageName).toBe('@se373/probe')
    expect(error.message).toContain('@se373/probe')
  })

  it('rejects a duplicate package registration', async () => {
    const ctx = await mount()
    ctx.invariants.register('@se373/probe', () => {})
    expect(() => ctx.invariants.register('@se373/probe', () => {}))
      .toThrow(/already registered/)
  })

  it('releases the name when the registration is disposed', async () => {
    const ctx = await mount()
    const dispose = ctx.invariants.register('@se373/probe', () => {})
    await new Promise(resolve => setTimeout(resolve, 0))

    await dispose()
    // A released name is registrable again; a leaked reservation would throw.
    expect(() => ctx.invariants.register('@se373/probe', () => {})).not.toThrow()
  })

  it('skips an installer excluded by the deny list but still reserves its name', async () => {
    const ctx = await mount({ package_blocklist: ['^@se373/noisy$'] })
    let ran = false
    ctx.invariants.register('@se373/noisy', () => { ran = true })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(ran).toBe(false)
    expect(() => ctx.invariants.register('@se373/noisy', () => {}))
      .toThrow(/already registered/)
  })

  it('runs nothing when globally disabled', async () => {
    const ctx = await mount({ enabled: false })
    let ran = false
    ctx.invariants.register('@se373/probe', () => { ran = true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ran).toBe(false)
  })

  it('admits only allow-listed packages when an allow list is set', async () => {
    const ctx = await mount({ package_allowlist: ['^@se373/kept$'] })
    const ran: string[] = []
    ctx.invariants.register('@se373/kept', () => { ran.push('kept') })
    ctx.invariants.register('@se373/dropped', () => { ran.push('dropped') })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ran).toEqual(['kept'])
  })

  it('rejects invalid filter patterns at construction', async () => {
    await expect(mount({ package_blocklist: ['('] })).rejects.toThrow(/invalid regex/)
    await expect(mount({ package_allowlist: ['a', 'a'] })).rejects.toThrow(/duplicate regex/)
    await expect(mount({ package_allowlist: [' a'] })).rejects.toThrow(/non-blank/)
  })

  it('rejects a blank or whitespace-bearing package name', async () => {
    const ctx = await mount()
    expect(() => ctx.invariants.register('', () => {})).toThrow(/non-blank/)
    expect(() => ctx.invariants.register('a b', () => {})).toThrow(/whitespace/)
  })
})
