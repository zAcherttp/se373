/**
 * The vocabulary of the composed knowledge plane.
 *
 * @module @se373/knowledge/types
 */
/**
 * The write-path stages, **in cascade order**.
 *
 * The order is the specification, not a presentation choice: §5.5's rule is
 * that a change at stage N invalidates N…end and nothing before it, so this
 * array is what makes "which stage changed" answerable and "how much must be
 * redone" derivable rather than declared.
 */
export const WRITE_PATH_STAGES = ['source', 'chunker', 'embedder', 'store'];
//# sourceMappingURL=types.js.map