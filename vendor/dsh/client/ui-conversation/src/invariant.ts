/**
 * Package-owned invariant companion for `@se373/client-ui-conversation`.
 * @module @se373/client-ui-conversation/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

const PACKAGE_NAME = '@se373/client-ui-conversation'

/** Cordis companion plugin name. */
export const name = 'client-ui-conversation-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the conversation service emits no cordis events, and
 * both rings this package owns (the 'conversation.view' tab ring and the
 * 'conversation.chat.node' business renderer seat) ride the slot system, whose ledger
 * invariants live with the runtime slots package.
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
