/**
 * `ctx.embedder` over a local ONNX encoder — the default provider.
 *
 * No API key, no network at query time, no router: invariant I2 says a
 * generated agent is alive on arrival, and an embedding stage that needs a
 * credential before it can return a single vector is not. The cost is a
 * one-time download, which is deliberate and separate — see
 * `@se373/model-registry`.
 *
 * **Weights are never fetched from here.** If the bytes are absent the row still
 * mounts, `identity` still reads, the runtime graph still shows the node, and
 * only `embed` refuses — with the command that fixes it. That is I2's blocked
 * tier: a diagnosable state rather than a hole where a component should be.
 *
 * Loading is lazy. Mounting stays fast whether or not anything embeds this run,
 * and the ~310 MB session is built on the first call rather than at boot.
 *
 * @module @se373/embedder-onnx-local
 */

import { Context, Service } from '@se373/cordis'
import z from '@se373/schemastery'
import type Schema from '@se373/schemastery'
import { applyTemplate, Embedder, sealIdentity } from '@se373/embedding'
import type {
  EmbedderIdentity,
  EmbedderReadiness,
  EmbedResult,
  EmbedRole,
} from '@se373/embedding'
import type { ModelResolution } from '@se373/model-registry'
import type {} from '@se373/model-registry'
import { runBatch } from './session.ts'
import type { TokenizedBatch } from './session.ts'

export * from './session.ts'

/** Configuration for the local ONNX embedder. */
export interface Config {
  /** Registry row id. Defaults to the registry's shipped default. */
  readonly model?: string
  /**
   * Stored width, when it should differ from the row's default.
   *
   * Must be one of the row's `mrlDims`. This is the knob that makes a 256-dim
   * generation possible without a second download, and it is inside the
   * fingerprint, so changing it invalidates an index exactly as changing the
   * model would.
   */
  readonly dims?: number
  /** Texts per forward pass. Larger is faster and uses more memory. */
  readonly batchSize?: number
}

/** What a loaded model consists of. */
interface Loaded {
  readonly session: import('onnxruntime-node').InferenceSession
  readonly tokenize: (texts: readonly string[]) => TokenizedBatch
}

/**
 * The local ONNX embedding provider.
 */
export class OnnxLocalEmbedder extends Embedder {
  static override readonly name = 'embedder-onnx-local'
  static inject = ['modelRegistry'] as const

  static readonly Config: Schema<Config> = z.object({
    model: z.string(),
    dims: z.natural(),
    batchSize: z.natural().default(16),
  }) as Schema<Config>

  /** What this provider is. Readable even while {@link readiness} is blocked. */
  readonly identity: EmbedderIdentity

  private readonly batchSize: number
  private resolution: ModelResolution | undefined
  private loading: Promise<Loaded> | undefined

  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    const row = ctx.modelRegistry.row(config.model)
    const dims = config.dims ?? row.dims
    if (!row.mrlDims.includes(dims)) {
      throw new Error(
        `model ${row.id} cannot produce ${dims} dims; it offers [${row.mrlDims.join(', ')}]. `
        + 'Truncating a non-Matryoshka embedding yields well-formed vectors that mean nothing.',
      )
    }
    this.batchSize = config.batchSize ?? 16
    this.identity = sealIdentity({
      modelId: row.id,
      repo: row.repo,
      revision: row.revision,
      artifacts: row.artifacts,
      nativeDims: row.nativeDims,
      dims,
      maxTokens: row.maxTokens,
      templates: row.templates,
      normalize: row.normalize,
    })
  }

  /**
   * Resolve the model's bytes, and release the session on unload.
   *
   * Resolution happens here rather than in the constructor because it touches
   * the filesystem, and a service whose construction can be slow is a boot that
   * can be slow.
   */
  async* [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    this.resolution = await this.ctx.modelRegistry.resolve(this.identity.modelId)
    if (this.resolution.status === 'missing') {
      this.ctx.logger.warn('%s', this.resolution.remedy)
    }
    yield async () => {
      const loaded = await this.loading?.catch(() => undefined)
      this.loading = undefined
      await loaded?.session.release()
    }
  }

  /** Whether {@link embed} will run or refuse. */
  get readiness(): EmbedderReadiness {
    return this.resolution?.status === 'ready' ? 'ready' : 'blocked'
  }

  /** Why the provider is blocked, or `null` when it is ready. */
  get blockedReason(): string | null {
    if (this.resolution === undefined) return 'model resolution has not run yet'
    return this.resolution.status === 'missing' ? this.resolution.remedy : null
  }

  /** Build the session and tokenizer, once. */
  private load(): Promise<Loaded> {
    this.loading ??= (async (): Promise<Loaded> => {
      const resolution = this.resolution
      if (resolution === undefined || resolution.status !== 'ready') {
        throw new Error(this.blockedReason ?? 'model is not available')
      }
      const [ort, { TokenizerLoader }, { readFile }] = await Promise.all([
        import('onnxruntime-node'),
        import('@lenml/tokenizers'),
        import('node:fs/promises'),
      ])
      const [tokenizerJSON, tokenizerConfig] = await Promise.all([
        readFile(resolution.paths.tokenizer, 'utf8').then(text => JSON.parse(text) as unknown),
        readFile(resolution.paths.tokenizerConfig, 'utf8').then(text => JSON.parse(text) as unknown),
      ])
      const tokenizer = TokenizerLoader.fromPreTrained({
        tokenizerJSON: tokenizerJSON as never,
        tokenizerConfig: tokenizerConfig as never,
      })
      // External weights are found by the relative name recorded inside the
      // graph, so the session is created from the file path and never from a
      // buffer -- a buffer has no directory for the sidecar to be beside.
      const session = await ort.InferenceSession.create(resolution.paths.onnx, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      })
      const maxLength = this.identity.maxTokens
      return {
        session,
        tokenize: (texts) => {
          const encoded = tokenizer(texts as string[], {
            padding: true,
            truncation: true,
            max_length: maxLength,
          }) as { input_ids: number[][], attention_mask: number[][] }
          return { inputIds: encoded.input_ids, attentionMask: encoded.attention_mask }
        },
      }
    })()
    return this.loading
  }

  /**
   * Embed a batch of texts.
   * @param texts - raw texts; templating happens here, not in the caller.
   * @param role - which side of the model's asymmetry these texts are.
   * @returns vectors in input order, tagged with this provider's fingerprint.
   */
  async embed(texts: readonly string[], role: EmbedRole): Promise<EmbedResult> {
    if (this.readiness !== 'ready') throw new Error(this.blockedReason ?? 'embedder is blocked')
    if (texts.length === 0) {
      return { fingerprint: this.identity.fingerprint, dims: this.identity.dims, vectors: [] }
    }
    const loaded = await this.load()
    const vectors: Float32Array[] = []
    // Chunked rather than one padded batch: padding is per batch, so a single
    // 4000-token document in a 2000-text call would pad every other row out to
    // its length and multiply the work by orders of magnitude.
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const slice = texts.slice(start, start + this.batchSize)
      const rendered = slice.map(text => applyTemplate(this.identity, role, text))
      vectors.push(...await runBatch(loaded.session, this.identity, loaded.tokenize(rendered)))
    }
    return { fingerprint: this.identity.fingerprint, dims: this.identity.dims, vectors }
  }
}

export default OnnxLocalEmbedder
