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

import * as ort from 'onnxruntime-node'
import { normalizeInPlace, truncateToDims } from '@se373/embedding'
import type { EmbedderIdentity } from '@se373/embedding'

/** A padded batch as the tokenizer hands it over. */
export interface TokenizedBatch {
  /** Token ids, batch-major, every row the same length. */
  readonly inputIds: readonly (readonly number[])[]
  /** 1 for a real token, 0 for padding; same shape as {@link inputIds}. */
  readonly attentionMask: readonly (readonly number[])[]
}

/** An int64 tensor from a rectangular number matrix. */
function int64(rows: readonly (readonly number[])[]): ort.Tensor {
  const height = rows.length
  const width = height === 0 ? 0 : rows[0]!.length
  const flat = new BigInt64Array(height * width)
  for (let r = 0; r < height; r += 1) {
    const row = rows[r]!
    for (let c = 0; c < width; c += 1) flat[r * width + c] = BigInt(row[c]!)
  }
  return new ort.Tensor('int64', flat, [height, width])
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
export function buildFeeds(session: ort.InferenceSession, batch: TokenizedBatch): Record<string, ort.Tensor> {
  const height = batch.inputIds.length
  const width = height === 0 ? 0 : batch.inputIds[0]!.length
  const feeds: Record<string, ort.Tensor> = {}
  for (const name of session.inputNames) {
    switch (name) {
      case 'input_ids':
        feeds[name] = int64(batch.inputIds)
        break
      case 'attention_mask':
        feeds[name] = int64(batch.attentionMask)
        break
      case 'token_type_ids':
        feeds[name] = int64(batch.inputIds.map(row => row.map(() => 0)))
        break
      case 'position_ids':
        // Absolute positions from zero, padding included. Padded positions are
        // masked out of attention anyway, and the alternative -- restarting the
        // count per sequence -- is what the reference implementations do.
        feeds[name] = int64(Array.from({ length: height }, () => Array.from({ length: width }, (_, i) => i)))
        break
      default:
        throw new Error(
          `graph requires an input this provider does not know how to build: ${name} `
          + `(known: input_ids, attention_mask, token_type_ids, position_ids)`,
        )
    }
  }
  return feeds
}

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
export function meanPool(hidden: Float32Array, dims: readonly number[], mask: readonly (readonly number[])[]): Float32Array[] {
  const [batchSize, sequence, width] = dims as [number, number, number]
  const out: Float32Array[] = []
  for (let b = 0; b < batchSize; b += 1) {
    const summed = new Float32Array(width)
    let counted = 0
    for (let s = 0; s < sequence; s += 1) {
      if (mask[b]![s] !== 1) continue
      counted += 1
      const base = (b * sequence + s) * width
      for (let d = 0; d < width; d += 1) summed[d]! += hidden[base + d]!
    }
    // A sequence with an all-zero mask cannot arise from a non-empty text, but
    // dividing by zero here would produce NaNs that survive normalization as
    // NaNs and poison every later comparison, so it is guarded rather than
    // assumed away.
    if (counted > 0) for (let d = 0; d < width; d += 1) summed[d]! /= counted
    out.push(summed)
  }
  return out
}

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
export function chooseOutput(session: ort.InferenceSession): { name: string, pooled: boolean } {
  if (session.outputNames.includes('sentence_embedding')) return { name: 'sentence_embedding', pooled: true }
  if (session.outputNames.includes('last_hidden_state')) return { name: 'last_hidden_state', pooled: false }
  throw new Error(
    `graph exposes no usable embedding output (has: ${session.outputNames.join(', ')}); `
    + 'expected sentence_embedding or last_hidden_state',
  )
}

/**
 * Run a tokenized batch and reduce it to stored-width vectors.
 * @param session - the loaded graph.
 * @param identity - the model's declared identity, for width and normalization.
 * @param batch - the padded token batch.
 * @returns one vector per input row, at `identity.dims`.
 */
export async function runBatch(
  session: ort.InferenceSession,
  identity: EmbedderIdentity,
  batch: TokenizedBatch,
): Promise<Float32Array[]> {
  const output = chooseOutput(session)
  const results = await session.run(buildFeeds(session, batch))
  const tensor = results[output.name]
  if (tensor === undefined) throw new Error(`graph did not return ${output.name}`)
  const data = tensor.data as Float32Array

  const vectors = output.pooled
    ? Array.from({ length: tensor.dims[0]! }, (_, b) =>
        data.slice(b * tensor.dims[1]!, (b + 1) * tensor.dims[1]!))
    : meanPool(data, tensor.dims as number[], batch.attentionMask)

  const width = vectors[0]?.length ?? identity.nativeDims
  if (width !== identity.nativeDims) {
    // Loud, because the alternative is an index full of vectors from a model
    // that is not the one the fingerprint names.
    throw new Error(`graph emitted ${width}-dim vectors, identity declares nativeDims ${identity.nativeDims}`)
  }

  return vectors.map((vector) => {
    // Truncation always renormalizes, regardless of `identity.normalize`: a
    // Matryoshka prefix of a unit vector is not a unit vector, and leaving it
    // un-renormalized turns cosine ranking into a function of how much was
    // discarded. Full-width output honours the declared setting.
    if (identity.dims < identity.nativeDims) return truncateToDims(vector, identity.dims)
    return identity.normalize ? normalizeInPlace(vector) : vector
  })
}
