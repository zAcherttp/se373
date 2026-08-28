/**
 * Runtime invariant companion for `@se373/client-ui-board`.
 *
 * @module @se373/client-ui-board/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'

/**
 * No host-side invariant.
 *
 * What could go wrong here goes wrong in the browser — a missing bundle, an
 * unmounted Remote — and neither is observable from the host context. The
 * registration still happens so the package owns its name in the registry and
 * a later check has somewhere to go.
 */
const check: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - the context the companion mounts in.
 */
export default function (ctx: Context): void {
  ctx.inject(['invariants'], (ctx) => {
    ctx.invariants.register('@se373/client-ui-board', check)
  })
}
