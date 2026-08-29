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

import type { ModelRow } from './types.ts'

/**
 * EmbeddingGemma 300M, int8-quantized ONNX — the default.
 *
 * Three things decided this. Its ONNX graph emits `sentence_embedding`
 * directly, so mean-pooling, the two Matryoshka dense heads and normalization
 * all happen inside the graph rather than in code of ours that could be subtly
 * wrong. It is Matryoshka-trained, so one download backs 768, 512, 256 and 128.
 * And the export lives in an **ungated** community mirror: `google/…` itself is
 * `gated: manual`, which would put a browser consent step inside an automated
 * acquisition.
 *
 * `fp16` and `q4f16` exist upstream and are unusable — the model card is
 * explicit that EmbeddingGemma activations do not support fp16.
 */
const EMBEDDING_GEMMA_300M_Q8: ModelRow = {
  id: 'embeddinggemma-300m-q8',
  repo: 'onnx-community/embeddinggemma-300m-ONNX',
  revision: '5090578d9565bb06545b4552f76e6bc2c93e4a66',
  files: {
    onnx: 'onnx/model_quantized.onnx',
    onnxData: 'onnx/model_quantized.onnx_data',
    tokenizer: 'tokenizer.json',
    tokenizerConfig: 'tokenizer_config.json',
  },
  artifacts: [
    {
      file: 'onnx/model_quantized.onnx',
      sha256: '172efde319fe1542dc41f31be6154910b05b78f7a861c265c4600eec906bd6d8',
      bytes: 567874,
    },
    {
      file: 'onnx/model_quantized.onnx_data',
      sha256: '705626e28e4c23c82ade34566b4197d97f534c12275fa406dfb71e9937d388c0',
      bytes: 308890624,
    },
    {
      file: 'tokenizer.json',
      sha256: '4dda02faaf32bc91031dc8c88457ac272b00c1016cc679757d1c441b248b9c47',
      bytes: 20323312,
    },
    {
      file: 'tokenizer_config.json',
      sha256: '3ca953eea6c3c9fcda9cf3df22949ff18b216f7c74bd6459230f3f1013953f3a',
      bytes: 1156830,
    },
  ],
  nativeDims: 768,
  dims: 768,
  mrlDims: [768, 512, 256, 128],
  maxTokens: 2048,
  // The document side has a `title:` slot upstream. It is pinned to `none` here
  // because nothing in the pipeline produces titles yet, and a template field
  // that no caller can set is a lie about what is configurable. It becomes a
  // real slot when chunks carry titles, which is a phase-6b change and a new
  // fingerprint by construction.
  templates: {
    document: 'title: none | text: {content}',
    query: 'task: search result | query: {content}',
  },
  normalize: true,
  license: 'gemma',
  summary: 'Google EmbeddingGemma 300M, int8 ONNX, 768d Matryoshka, 100+ languages, 2048 tokens',
}

/**
 * Multilingual E5 Small, int8 ONNX — the small alternative.
 *
 * Kept because it disagrees with the default in every dimension that matters:
 * 384 fixed dims against 768 Matryoshka, 512 tokens against 2048, and bare
 * `query: `/`passage: ` prefixes against Gemma's task templates. A registry
 * whose rows all look alike would not have caught the template placeholder rule
 * or the per-generation width rule.
 *
 * Its ONNX graph emits `last_hidden_state`, so the provider mean-pools it —
 * unlike the default. That difference is deliberate coverage of the pooling
 * path, not an oversight.
 */
const MULTILINGUAL_E5_SMALL_INT8: ModelRow = {
  id: 'multilingual-e5-small-int8',
  repo: 'intfloat/multilingual-e5-small',
  revision: '614241f622f53c4eeff9890bdc4f31cfecc418b3',
  files: {
    onnx: 'onnx/model_qint8_avx512_vnni.onnx',
    tokenizer: 'onnx/tokenizer.json',
    tokenizerConfig: 'onnx/tokenizer_config.json',
  },
  artifacts: [
    {
      file: 'onnx/model_qint8_avx512_vnni.onnx',
      sha256: 'dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88',
      bytes: 118346824,
    },
    {
      file: 'onnx/tokenizer.json',
      sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
      bytes: 17082730,
    },
    {
      file: 'onnx/tokenizer_config.json',
      sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
      bytes: 443,
    },
  ],
  nativeDims: 384,
  dims: 384,
  mrlDims: [384],
  maxTokens: 512,
  templates: {
    document: 'passage: {content}',
    query: 'query: {content}',
  },
  normalize: true,
  license: 'mit',
  summary: 'intfloat multilingual-e5-small, int8 ONNX, 384d, 100 languages, 512 tokens',
}

/** Every model shipped as a system row, in preference order. */
export const BUILTIN_MODELS: readonly ModelRow[] = [
  EMBEDDING_GEMMA_300M_Q8,
  MULTILINGUAL_E5_SMALL_INT8,
]

/** The row used when config names none. */
export const DEFAULT_MODEL_ID = EMBEDDING_GEMMA_300M_Q8.id
