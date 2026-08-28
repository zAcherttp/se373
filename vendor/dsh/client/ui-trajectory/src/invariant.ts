/**
 * Package-owned invariant companion for `@se373/client-ui-trajectory`.
 * @module @se373/client-ui-trajectory/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/client-ui-trajectory'

/** Cordis companion plugin name. */
export const name = 'client-ui-trajectory-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin — it emits no cordis events
 * and owns no mutable cross-plugin state; its view-slot registration is a
 * plain effect whose disposal the slot ledger's own specs and this
 * package's behavior specs observe directly.
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
