/**
 * A consumer that does nothing but inject `loggerJsonl` by name.
 *
 * Its only job is to be resolvable: two copies of this row, one per realm, must
 * reach two different providers. It reports the path its provider opened, so
 * the proof does not rest on the projection agreeing with itself.
 */

import type { Context } from '@se373/cordis'
import type {} from '@se373/logger-jsonl'

export const inject = ['loggerJsonl']

export function apply(ctx: Context): void {
  ctx.logger.info('resolved loggerJsonl → %C', ctx.loggerJsonl.path ?? '(not open yet)')
}

export default { inject, apply }
