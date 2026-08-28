/**
 * The projection itself: loader entries and live fibers in, {@link
 * RuntimeGraphNode}s out.
 *
 * Kept separate from the service so the derivation is readable on its own, and
 * so a future push transport can reuse it without owning the service.
 *
 * @module @se373/runtime-graph/project
 */
import { Context } from '@se373/cordis';
import type { TransitionRecorder } from './transitions.ts';
import type { RuntimeGraphNode } from './types.ts';
/**
 * Project the whole loader tree, in loader order.
 * @param ctx - a context with `ctx.loader` available.
 * @param transitions - the lifecycle history recorder, when one is running.
 * @returns one node per configured entry, disabled rows included.
 */
export declare function projectTree(ctx: Context, transitions?: TransitionRecorder): RuntimeGraphNode[];
//# sourceMappingURL=project.d.ts.map