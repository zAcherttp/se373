/**
 * Prompt templating for asymmetric retrieval models.
 *
 * Retrieval-tuned encoders are trained with a fixed prefix per side, and they
 * are the reason {@link EmbedRole} exists. The template is model data, carried
 * on the identity and hashed into the fingerprint, so a provider never hardcodes
 * one and two rows differing only in template are correctly treated as
 * incomparable models.
 *
 * @module @se373/embedding/template
 */
import type { EmbedderIdentity, EmbedRole } from './types.ts';
/** The single placeholder a template must contain. */
export declare const CONTENT_PLACEHOLDER = "{content}";
/**
 * Render one text into its role's template.
 * @param identity - the model whose templates apply.
 * @param role - which side of the asymmetry.
 * @param text - the raw text.
 * @returns the string to tokenize.
 */
export declare function applyTemplate(identity: EmbedderIdentity, role: EmbedRole, text: string): string;
/**
 * Why a template is unusable, or `null` if it is fine.
 *
 * A template missing its placeholder is the failure this guards: it silently
 * embeds the *same* constant string for every input, producing an index in
 * which everything is equidistant from everything. That looks like a bad model
 * rather than a bad config, so it is worth refusing at mount time.
 * @param template - a candidate template string.
 * @returns a human-readable reason, or `null`.
 */
export declare function templateFault(template: string): string | null;
//# sourceMappingURL=template.d.ts.map