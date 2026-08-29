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
import { Context, Service } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import { Embedder } from '@se373/embedding';
import type { EmbedderIdentity, EmbedderReadiness, EmbedResult, EmbedRole } from '@se373/embedding';
export * from './session.ts';
/** Configuration for the local ONNX embedder. */
export interface Config {
    /** Registry row id. Defaults to the registry's shipped default. */
    readonly model?: string;
    /**
     * Stored width, when it should differ from the row's default.
     *
     * Must be one of the row's `mrlDims`. This is the knob that makes a 256-dim
     * generation possible without a second download, and it is inside the
     * fingerprint, so changing it invalidates an index exactly as changing the
     * model would.
     */
    readonly dims?: number;
    /** Texts per forward pass. Larger is faster and uses more memory. */
    readonly batchSize?: number;
}
/**
 * The local ONNX embedding provider.
 */
export declare class OnnxLocalEmbedder extends Embedder {
    static readonly name = "embedder-onnx-local";
    static inject: readonly ["modelRegistry"];
    static readonly Config: Schema<Config>;
    /** What this provider is. Readable even while {@link readiness} is blocked. */
    readonly identity: EmbedderIdentity;
    private readonly batchSize;
    private resolution;
    private loading;
    constructor(ctx: Context, config?: Config);
    /**
     * Resolve the model's bytes, and release the session on unload.
     *
     * Resolution happens here rather than in the constructor because it touches
     * the filesystem, and a service whose construction can be slow is a boot that
     * can be slow.
     */
    [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void>;
    /** Whether {@link embed} will run or refuse. */
    get readiness(): EmbedderReadiness;
    /** Why the provider is blocked, or `null` when it is ready. */
    get blockedReason(): string | null;
    /** Build the session and tokenizer, once. */
    private load;
    /**
     * Embed a batch of texts.
     * @param texts - raw texts; templating happens here, not in the caller.
     * @param role - which side of the model's asymmetry these texts are.
     * @returns vectors in input order, tagged with this provider's fingerprint.
     */
    embed(texts: readonly string[], role: EmbedRole): Promise<EmbedResult>;
}
export default OnnxLocalEmbedder;
//# sourceMappingURL=index.d.ts.map