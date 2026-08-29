/**
 * The models that ship with the project.
 *
 * These are `origin: system` rows in the same sense the recipes are: shipped by
 * us, forkable by anyone, and not privileged in any way a config-declared row
 * is not. Two rows rather than one on purpose — they differ in width, in context
 * budget, and in template shape, which is what keeps the seam honest. A seam
 * with one provider is a wrapper.
 *
 * Every digest here was read from the Hugging Face API at the pinned revision,
 * not copied from a model card. `scripts/models-pin.mts` regenerates them.
 *
 * @module @se373/model-registry/catalog
 */
import type { ModelRow } from './types.ts';
/** Every model shipped as a system row, in preference order. */
export declare const BUILTIN_MODELS: readonly ModelRow[];
/** The row used when config names none. */
export declare const DEFAULT_MODEL_ID: string;
//# sourceMappingURL=catalog.d.ts.map