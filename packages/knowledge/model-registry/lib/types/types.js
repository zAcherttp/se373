/**
 * What a declared model is, and what "we have it" means.
 *
 * The shape here answers a specific instruction: models are **not fetched on
 * use**. A row is a *declaration* — these bytes, at this revision, of this
 * width — and having the bytes is a separate, deliberate act. A provider whose
 * row is declared but whose bytes are absent mounts blocked and says so; it does
 * not quietly start a 300 MB download inside somebody's first query.
 *
 * @module @se373/model-registry/types
 */
export {};
//# sourceMappingURL=types.js.map