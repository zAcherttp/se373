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
import { contributeNode } from '@se373/runtime-graph';
import { SYSTEM_BLOCKS } from "./manifests.js";
export * from "./manifests.js";
export const name = 'system-blocks';
export const inject = ['blocks'];
/**
 * Register every shipped block.
 * @param ctx - the plugin context; `blocks` is injected.
 */
export function apply(ctx) {
    contributeNode(ctx, { role: 'core', tier: 'L4', label: 'System block manifests' });
    for (const entry of SYSTEM_BLOCKS)
        ctx.blocks.register(entry);
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map