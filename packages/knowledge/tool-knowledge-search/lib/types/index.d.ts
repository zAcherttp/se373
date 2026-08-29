/**
 * `search_knowledge` — the model's door into the knowledge plane.
 *
 * §5.6 is the whole design of this package: it injects **`ctx.knowledgePipeline`
 * only**, never an individual stage. Swapping the chunker, the embedder or the
 * store is then invisible here, so the tool never needs regenerating and its
 * schema never encodes a stage's vocabulary. A tool that injected `ctx.embedder`
 * to "check the dimensions" would tie the model's interface to a config row.
 *
 * A separate package from the pipeline for the same reason `tool-graph-inspect`
 * is separate from `runtime-graph`: the pipeline is infrastructure, and handing
 * it to a model is a deployment choice — which invariant I3 says is a row you
 * can disable, not an import you have to delete.
 *
 * @module @se373/tool-knowledge-search
 */
import type { Context } from '@se373/cordis';
import type { RetrievedChunk } from '@se373/knowledge';
export declare const name = "tool-knowledge-search";
export declare const inject: string[];
/**
 * Render hits for the model, best first.
 * @param query - the query that produced them.
 * @param hits - the results.
 * @returns readable text.
 */
export declare function renderHits(query: string, hits: readonly RetrievedChunk[]): string;
/**
 * Register the tool and its prompt line.
 * @param ctx - the plugin context; `tools`, `knowledgePipeline` and `systemPrompt` are injected.
 */
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map