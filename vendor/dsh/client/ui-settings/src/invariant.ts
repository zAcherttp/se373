/**
 * Package-owned invariant companion for `@se373/client-ui-settings`.
 * @module @se373/client-ui-settings/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/client-ui-settings'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a presentation shell projecting the settings.section
 * ledger into navigation — it emits no cordis events and owns no cross-plugin
 * mutable relation; slot declaration/registration conflicts already fail loud
 * in the slot core at load time.
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
