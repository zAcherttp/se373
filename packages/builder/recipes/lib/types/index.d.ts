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
import type { Context } from '@se373/cordis';
export * from './cookbook.ts';
export declare const name = "recipes";
export declare const inject: string[];
/**
 * Register every shipped recipe.
 * @param ctx - the plugin context; `blocks` is injected.
 */
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map