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
import type { Context } from '@se373/cordis';
export * from './manifests.ts';
export declare const name = "system-blocks";
export declare const inject: string[];
/**
 * Register every shipped block.
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