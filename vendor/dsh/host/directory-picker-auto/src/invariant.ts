/**
 * Package-owned invariant companion for the adaptive directory-picker chooser.
 * @module @se373/host-directory-picker-auto/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/host-directory-picker-auto'

/** Cordis companion plugin name. */
export const name = 'host-directory-picker-auto-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the sole effect is one boot-time Loader-entry mount owned by the plugin fiber; the store is authoritative. */
const install: InvariantInstaller = () => {}

/**
 * Register the adaptive directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
