/**
 * Package-owned invariant companion for `@se373/client-locale`.
 * @module @se373/client-locale/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/client-locale'

/** Cordis companion plugin name. */
export const name = 'client-locale-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: ns-by-locale dictionary registry with a stable
 * bind(ns) API — it emits no cordis events and owns no cross-plugin
 * mutable relation; fallback-chain resolution and locale-store behavior are
 * asserted directly by this package's behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
