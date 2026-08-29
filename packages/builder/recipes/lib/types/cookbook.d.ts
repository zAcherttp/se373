/**
 * The six shipped recipes, one per SE373 archetype.
 *
 * A recipe is **click-to-prefill**: not just prompt text, but the model, the
 * thinking effort, the blocks it expects, and whatever else is configurable,
 * chosen by us for the best result. Clicking one loads all of it, ready to send
 * or edit.
 *
 * They ship as `kind: 'recipe'`, `origin: 'system'` blocks, which means
 * **forking a recipe is the same gesture as forking anything else**. A user who
 * wants their own starter needs no new mechanism, no new UI and no new file
 * location, and their fork appears in the same cookbook with a different badge.
 *
 * **A recipe carries a description of the system it builds, not a specification
 * of it.** Two builds of one recipe may compose differently, and that is
 * intended — it is what makes a v1-versus-v2 comparison interesting rather than
 * a formality. The bound on that variance is a conformance suite, which needs a
 * seam to conform to; the recipes whose seams exist name them, and the ones
 * whose seams do not are prose until they do.
 *
 * @module @se373/recipes/cookbook
 */
import type { BlockInput } from '@se373/block-registry';
/** A recipe's prefill, carried in its manifest defaults. */
export interface RecipePrefill {
    /** The archetype this serves, as SE373 names it. */
    readonly archetype: string;
    /** What gets loaded into the chat box. */
    readonly prompt: string;
    /**
     * The fabricated agent's own voice.
     *
     * Written into the fabricated preset's persona row, and scoped to that agent
     * alone — the main builder's persona settings never see it. `{{model}}` and
     * `{{cwd}}` interpolate the way upstream's persona rows do.
     */
    readonly persona: string;
    /**
     * Filesystem posture, when the agent composes filesystem tools.
     *
     * `read-only` shadows `fs` and `sandboxPolicy` in the preset's own realm over
     * a read-only policy, the shape the shipped `inspect` preset proved. Absent
     * means `workspace-write` over the fabricated agent's own workspace.
     */
    readonly filesystem?: 'read-only';
    /** Thinking effort to preselect. */
    readonly effort: 'low' | 'medium' | 'high';
    /** The agent preset a build starts from. */
    readonly preset: string;
    /** Block ids a build is expected to compose. */
    readonly blocks: readonly string[];
    /** What a person should expect to be able to do afterwards. */
    readonly outcome: string;
}
/** Every shipped recipe, in the order SE373 lists the archetypes. */
export declare const COOKBOOK: readonly BlockInput[];
//# sourceMappingURL=cookbook.d.ts.map