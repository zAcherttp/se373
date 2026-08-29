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

import type { ArtifactDigest, EmbedRole } from '@se373/embedding'

/**
 * The files a provider actually opens.
 *
 * Named slots rather than a bare list, because their roles are not
 * interchangeable and a provider should not be guessing which of four paths is
 * the tokenizer. Every path here also appears in {@link ModelRow.artifacts},
 * which is what gets verified.
 */
export interface ModelFiles {
  /**
   * The ONNX graph, repository-relative.
   *
   * For exports over ~2 GB of tensors this file is only the graph; the weights
   * live in {@link onnxData}.
   */
  readonly onnx: string
  /**
   * External weights sidecar, when the export has one.
   *
   * ONNX stores the sidecar's name *inside* the graph as a plain relative
   * filename, so the two must land in the same directory under their original
   * names. That constraint is why the cache mirrors repository paths verbatim
   * instead of flattening them.
   */
  readonly onnxData?: string
  /** `tokenizer.json` — the full serialized tokenizer, loadable offline. */
  readonly tokenizer: string
  /** `tokenizer_config.json` — the class name and special-token wiring. */
  readonly tokenizerConfig: string
}

/**
 * One usable model, pinned to bytes.
 *
 * A row is the unit invariant I3 talks about: choosing a different model is
 * editing which row is named, never editing code.
 */
export interface ModelRow {
  /** Stable local id, e.g. `embeddinggemma-300m-q8`. Referenced from config. */
  readonly id: string
  /** Hugging Face repository. */
  readonly repo: string
  /** Commit sha. Never a branch — see `@se373/embedding/conformance`. */
  readonly revision: string
  /** Which file plays which part. */
  readonly files: ModelFiles
  /** Digest and size for every file in {@link files}. */
  readonly artifacts: readonly ArtifactDigest[]
  /** Width the graph emits. */
  readonly nativeDims: number
  /** Default stored width; must appear in {@link mrlDims}. */
  readonly dims: number
  /**
   * Every width this model may legitimately be truncated to.
   *
   * A Matryoshka-trained model lists several; an ordinary one lists exactly
   * `[nativeDims]`. This is what makes "which models can serve a 256-dimensional
   * generation" a query rather than folklore.
   */
  readonly mrlDims: readonly number[]
  /** Token budget per text. */
  readonly maxTokens: number
  /** Per-role prompt template; each must contain `{content}`. */
  readonly templates: Readonly<Record<EmbedRole, string>>
  /** Whether the provider L2-normalizes on the way out. */
  readonly normalize: boolean
  /** SPDX-ish licence label, for the acquisition prompt and for `PORTING.md`. */
  readonly license: string
  /** One line a human reads before agreeing to a download. */
  readonly summary: string
}

/** A model whose bytes are on disk and verified. */
export interface ResolvedModel {
  readonly status: 'ready'
  readonly row: ModelRow
  /** Absolute directory holding the repository tree. */
  readonly dir: string
  /** Absolute path per {@link ModelFiles} slot. */
  readonly paths: { readonly [K in keyof ModelFiles]: ModelFiles[K] extends string ? string : string | undefined }
}

/** A model that has been declared but not acquired. */
export interface MissingModel {
  readonly status: 'missing'
  readonly row: ModelRow
  /** Where it would live. */
  readonly dir: string
  /** Repository-relative paths that are absent or the wrong size. */
  readonly missing: readonly string[]
  /** Total bytes an acquisition would transfer. */
  readonly bytes: number
  /** What a human should be told, including the command that fixes it. */
  readonly remedy: string
}

/** The outcome of asking for a model. */
export type ModelResolution = ResolvedModel | MissingModel

/** Progress during acquisition. */
export interface AcquireProgress {
  /** Repository-relative path currently transferring. */
  readonly file: string
  /** Bytes written for this file so far. */
  readonly received: number
  /** Expected size of this file. */
  readonly total: number
  /** 1-based index of this file within the set. */
  readonly index: number
  /** How many files the set has. */
  readonly count: number
}

/** Options for {@link ModelRegistry.acquire}. */
export interface AcquireOptions {
  /** Called as bytes land. */
  readonly onProgress?: (progress: AcquireProgress) => void
  /** Abort the transfer. */
  readonly signal?: AbortSignal
}
