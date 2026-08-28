/** Package-owned invariant companion for the directory-picker seam. @module @se373/host-directory-picker/invariant */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/host-directory-picker'

/** Cordis companion plugin name. */
export const name = 'host-directory-picker-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this stateless Service Definition owns the capability
 * vocabulary, while backends and the RPC consumer own observations.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
