/**
 * The cookbook, registered into `ctx.blocks`.
 *
 * A row rather than a hardcoded seed inside the repository, for the reason I3
 * gives for everything else: which recipes ship is a deployment choice, so it is
 * a config row you can disable, not an import somebody has to delete. Disabling
 * this row leaves a working repository with no cookbook, which is a legitimate
 * configuration.
 *
 * @module @se373/recipes
 */
import { contributeNode } from '@se373/runtime-graph';
import { COOKBOOK } from "./cookbook.js";
export * from "./cookbook.js";
export const name = 'recipes';
export const inject = ['blocks'];
/**
 * Register every shipped recipe.
 * @param ctx - the plugin context; `blocks` is injected.
 */
export function apply(ctx) {
    contributeNode(ctx, { role: 'core', tier: 'L4', label: 'Recipe cookbook' });
    for (const entry of COOKBOOK)
        ctx.blocks.register(entry);
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map