/**
 * The vocabulary of the embedding seam.
 *
 * Two ideas carry everything else here.
 *
 * **A model's identity is what changes its output, not what it is called.** Two
 * rows naming `embeddinggemma-300m` that differ in truncated dimensionality, in
 * prompt template, or in the bytes their revision resolves to produce vectors
 * that cannot be compared, and nothing about the comparison fails — it just
 * returns confident nonsense. So identity is a digest over every such field, and
 * the model *name* is not one of the inputs that matters.
 *
 * **A vector is never separated from the identity that produced it.** That is
 * why {@link EmbedResult} is a batch carrying one fingerprint rather than a bare
 * `Float32Array[]`: a store cannot forget to check what it was handed if the
 * check is on the value it receives.
 *
 * @module @se373/embedding/types
 */

/**
 * Which side of an asymmetric model a text is being embedded for.
 *
 * Retrieval models are trained asymmetrically: EmbeddingGemma wants
 * `task: search result | query: …` on one side and `title: none | text: …` on
 * the other, and E5 wants `query: ` and `passage: `. Getting this wrong raises
 * no error and degrades recall silently, so the role is a required argument
 * rather than a convention a caller can forget.
 */
export type EmbedRole = 'document' | 'query'

/** Every role, for exhaustive iteration. */
export const EMBED_ROLES = ['document', 'query'] as const satisfies readonly EmbedRole[]

/**
 * One file a model is made of, pinned by content.
 *
 * ONNX exports above a couple of hundred megabytes split their weights into a
 * sidecar `.onnx_data`, so a model is a *set* of files and pinning one of them
 * pins nothing. `bytes` is carried because it is what an acquisition flow can
 * show a human before it starts, and because a length mismatch is detectable
 * before a 300 MB hash is computed.
 */
export interface ArtifactDigest {
  /** Repository-relative path, e.g. `onnx/model_quantized.onnx_data`. */
  readonly file: string
  /** Lowercase hex SHA-256 of the file's bytes. */
  readonly sha256: string
  /** Size in bytes. */
  readonly bytes: number
}

/**
 * Everything about a model that changes the vectors it produces.
 *
 * `fingerprint` is derived from the rest — see `fingerprint.ts`. It is stored on
 * the interface rather than recomputed at each use so that a blocked provider,
 * which cannot load a model at all, can still state which index generations it
 * would be able to read.
 */
export interface EmbedderIdentity {
  /** The registry row this came from. Human-facing; not an identity input. */
  readonly modelId: string
  /** Hugging Face repository id. */
  readonly repo: string
  /** A commit sha. Never a branch name — a branch is not a set of bytes. */
  readonly revision: string
  /** Every file the provider loads, sorted by path. */
  readonly artifacts: readonly ArtifactDigest[]
  /** The width the graph emits before any truncation. */
  readonly nativeDims: number
  /**
   * The width actually stored.
   *
   * Matryoshka models emit one width and permit a prefix of it to be used after
   * renormalizing, so a single set of weights legitimately backs several. That
   * is why dimensionality belongs to a generation rather than to the project.
   */
  readonly dims: number
  /** Token budget per text; longer inputs are truncated by the tokenizer. */
  readonly maxTokens: number
  /** Per-role prompt template. Each must contain the `{content}` placeholder. */
  readonly templates: Readonly<Record<EmbedRole, string>>
  /** Whether vectors are L2-normalized on the way out. */
  readonly normalize: boolean
  /** Lowercase hex SHA-256 over every field above except `modelId`. */
  readonly fingerprint: string
}

/** An identity before its digest is taken. */
export type EmbedderIdentityInput = Omit<EmbedderIdentity, 'fingerprint'>

/**
 * A batch of vectors and the identity that produced them.
 *
 * One fingerprint for the batch rather than one per vector: a batch is
 * necessarily homogeneous, and N copies of the same string invites the thought
 * that they might differ.
 */
export interface EmbedResult {
  /** {@link EmbedderIdentity.fingerprint} of the producing model. */
  readonly fingerprint: string
  /** Width of every vector below. Redundant with the fingerprint, and cheap. */
  readonly dims: number
  /** One vector per input text, in input order. */
  readonly vectors: readonly Float32Array[]
}

/**
 * Whether a provider can actually run.
 *
 * `blocked` is invariant I2's third tier and is a *mounted* state, not a failed
 * one: the row is on the graph, its identity is readable, and only `embed`
 * refuses. A provider that threw during construction would leave a hole where
 * the diagnosis should be.
 */
export type EmbedderReadiness = 'ready' | 'blocked'
