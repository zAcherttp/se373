/**
 * Register the shipped packages as blocks.
 *
 * A row, so which blocks the cookbook can see is a config choice rather than a
 * property of the code (I3). Disabling it leaves a working repository with
 * recipes that resolve to nothing — which is a legitimate configuration and
 * exactly what a plan's warnings are for.
 *
 * @module @se373/system-blocks
 */

import type { Context } from '@se373/cordis'
import type {} from '@se373/block-registry'
import { contributeNode } from '@se373/runtime-graph'
import { SYSTEM_BLOCKS } from './manifests.ts'

export * from './manifests.ts'

export const name = 'system-blocks'
export const inject = ['blocks']

/**
 * Register every shipped block.
 * @param ctx - the plugin context; `blocks` is injected.
 */
export function apply(ctx: Context): void {
  contributeNode(ctx, { role: 'core', tier: 'L4', label: 'System block manifests' })
  for (const entry of SYSTEM_BLOCKS) ctx.blocks.register(entry)
}

export default { name, inject, apply }
