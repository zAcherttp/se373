/**
 * Driving an ONNX encoder: feeds in, one vector per text out.
 *
 * Everything here is written to be *derived from the loaded graph* rather than
 * declared in config, because a declaration can be wrong and a graph cannot.
 * Which inputs to build comes from `session.inputNames`; whether the model
 * pools for us comes from `session.outputNames`. A config flag saying "this one
 * is pre-pooled" would be one more field to get wrong, and getting it wrong
 * produces vectors rather than an error.
 *
 * @module @se373/embedder-onnx-local/session
 */
import * as ort from 'onnxruntime-node';
import type { EmbedderIdentity } from '@se373/embedding';
/** A padded batch as the tokenizer hands it over. */
export interface TokenizedBatch {
    /** Token ids, batch-major, every row the same length. */
    readonly inputIds: readonly (readonly number[])[];
    /** 1 for a real token, 0 for padding; same shape as {@link inputIds}. */
    readonly attentionMask: readonly (readonly number[])[];
}
/**
 * Build exactly the feeds this graph asks for.
 *
 * Encoders disagree about their auxiliary inputs — BERT-family exports often
 * want `token_type_ids`, Gemma-family ones want `position_ids`, and some want
 * neither. Constructing from the graph's own input list means a new model works
 * without a code change, and an input we have never seen fails loudly and by
 * name instead of being silently omitted (which ONNX Runtime reports as a
 * shape error several layers away from the cause).
 * @param session - the loaded graph.
 * @param batch - the padded token batch.
 * @returns feeds keyed exactly as the graph expects.
 */
export declare function buildFeeds(session: ort.InferenceSession, batch: TokenizedBatch): Record<string, ort.Tensor>;
/**
 * Mean of the non-padding token vectors, per sequence.
 *
 * Exported for its spec: including padded positions in the mean is the archetypal
 * silent embedding bug — every vector shifts toward whatever the pad token
 * encodes, no error is raised, and the damage scales with how uneven the batch
 * is.
 * @param hidden - flat `[batch, sequence, width]` token vectors.
 * @param dims - the tensor's dimensions.
 * @param mask - 1 for a real token, 0 for padding.
 * @returns one pooled vector per sequence.
 */
export declare function meanPool(hidden: Float32Array, dims: readonly number[], mask: readonly (readonly number[])[]): Float32Array[];
/**
 * Which output carries the sentence representation.
 *
 * `sentence_embedding` means the export baked pooling, the Matryoshka dense
 * heads and normalization into the graph — that is the EmbeddingGemma export.
 * `last_hidden_state` means token vectors that still need pooling — that is the
 * E5 export. Preferring the pre-pooled output when both exist is deliberate:
 * the graph's own pooling is what the model was evaluated with.
 * @param session - the loaded graph.
 * @returns the output name and whether it still needs pooling.
 * @throws Error naming every output when neither is present.
 */
export declare function chooseOutput(session: ort.InferenceSession): {
    name: string;
    pooled: boolean;
};
/**
 * Run a tokenized batch and reduce it to stored-width vectors.
 * @param session - the loaded graph.
 * @param identity - the model's declared identity, for width and normalization.
 * @param batch - the padded token batch.
 * @returns one vector per input row, at `identity.dims`.
 */
export declare function runBatch(session: ort.InferenceSession, identity: EmbedderIdentity, batch: TokenizedBatch): Promise<Float32Array[]>;
//# sourceMappingURL=session.d.ts.map