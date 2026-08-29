/**
 * Block manifests for the packages this harness ships.
 *
 * §6.1 says one file per block, living with the block. This is one file for all
 * of them, and that is a **deliberate shortcut with a cost**: a manifest here can
 * drift from the package it describes, and nothing but this file's own invariant
 * would notice. The reason to accept it for now is that the alternative —
 * sixteen packages each gaining a manifest and a registration row — is a change
 * to sixteen packages in service of a registry that has not yet been used for
 * anything. When authoring lands at 6d and forks start naming parents, the
 * manifests move to their packages and this file becomes the seed for the
 * vendored ones only.
 *
 * Tiers are I2's, and they are the field that decides what a fabricated agent
 * can do on arrival: `ready` and `defaulted` blocks run, `blocked` blocks mount
 * inert and say what they need.
 *
 * @module @se373/system-blocks/manifests
 */
import type { BlockInput } from '@se373/block-registry';
/** Every block the shipped packages offer a builder. */
export declare const SYSTEM_BLOCKS: readonly BlockInput[];
//# sourceMappingURL=manifests.d.ts.map