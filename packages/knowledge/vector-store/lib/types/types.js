/**
 * The vocabulary of the vector store seam.
 *
 * One idea shapes all of it: **a generation is the unit, and its embedder
 * identity is a property of the generation, not of the rows inside it.**
 *
 * The tempting alternative is to tag each stored chunk with the model that
 * produced it. It is worse, and not by a little: per-row model metadata makes a
 * mixed-model generation *representable*, so an interrupted re-embed can leave
 * an index that is half one model and half another, and every query against it
 * returns confident nonsense with nothing raising an error. Binding identity to
 * the generation makes that state unspellable — a row's membership in a
 * generation is what says which model made it.
 *
 * What rows do carry is a content key, because incremental re-ingest needs to
 * know which *source* changed. That is a different question from which model
 * ran, and conflating them is how the first design goes wrong.
 *
 * @module @se373/vector-store/types
 */
export {};
//# sourceMappingURL=types.js.map