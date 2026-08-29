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
import { defineTool } from '@se373/tools';
import { contributeNode } from '@se373/runtime-graph';
export const name = 'tool-knowledge-search';
export const inject = ['tools', 'knowledgePipeline', 'systemPrompt'];
/** One retrieved chunk, as the model sees it. */
const HIT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        key: { type: 'string', required: true, description: 'Stable chunk id, `<document>#<index>`.' },
        title: {
            required: true,
            oneOf: [{ type: 'string' }, { type: 'null' }],
            description: 'The section heading or document title this passage sits under.',
        },
        text: { type: 'string', required: true, description: 'The passage.' },
        distance: {
            type: 'number',
            required: true,
            description: 'Vector distance; smaller is nearer. Comparable within one result set, not across queries.',
        },
    },
};
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        query: { type: 'string', required: true },
        hits: { type: 'array', items: HIT_SCHEMA, required: true },
    },
};
const DESCRIPTION = 'Search the indexed knowledge base by meaning rather than by keyword, and return the '
    + 'passages that best match. The index is multilingual: a question in one language retrieves passages '
    + 'written in another, so ask in whatever language the question came in. Each hit carries the section '
    + 'heading it sits under, which is usually more useful than the passage alone for deciding whether it '
    + 'answers the question. Distances are comparable within one result set and meaningless across '
    + 'different queries, so use them to rank, never as a confidence score. This tool reads a prebuilt '
    + 'index and changes nothing; if the index was built by a different configuration than the one running, '
    + 'it refuses rather than answering from stale vectors.';
/**
 * Render hits for the model, best first.
 * @param query - the query that produced them.
 * @param hits - the results.
 * @returns readable text.
 */
export function renderHits(query, hits) {
    if (hits.length === 0)
        return `No passages matched ${JSON.stringify(query)}.`;
    const lines = [`${hits.length} passage(s) for ${JSON.stringify(query)}:`, ''];
    for (const [index, hit] of hits.entries()) {
        lines.push(`${index + 1}. ${hit.title ?? hit.key}  (${hit.key}, distance ${hit.distance.toFixed(4)})`);
        lines.push(...(hit.text ?? '').split('\n').map(line => `   ${line}`));
        lines.push('');
    }
    return lines.join('\n');
}
/**
 * Register the tool and its prompt line.
 * @param ctx - the plugin context; `tools`, `knowledgePipeline` and `systemPrompt` are injected.
 */
export function apply(ctx) {
    contributeNode(ctx, { role: 'tool', tier: 'L3', label: 'Knowledge search' });
    ctx.systemPrompt.section({
        name: 'tool:search_knowledge',
        order: 106,
        text: 'Use search_knowledge to look things up in the indexed knowledge base before answering from '
            + 'memory. It searches by meaning and across languages, so ask it the user\'s actual question '
            + 'rather than guessing keywords. Quote or cite the passage keys you used.',
    });
    ctx.tools.register(defineTool({
        name: 'search_knowledge',
        description: DESCRIPTION,
        parameters: {
            query: {
                type: 'string',
                required: true,
                description: 'The question or topic, in any language. Full questions retrieve better than keywords.',
            },
            k: {
                type: 'integer',
                description: 'How many passages to return. Defaults to the pipeline\'s configured value.',
            },
        },
        output: {
            schema: OUTPUT_SCHEMA,
            render: (_args, value) => {
                const result = value;
                return [{ type: 'text', text: renderHits(result.query, result.hits) }];
            },
        },
        // Retrieval reads a generation and writes nothing, so overlapping calls
        // cannot interfere.
        isConcurrencySafe: () => true,
        async execute(args) {
            const hits = await ctx.knowledgePipeline.retrieve(args.query, args.k === undefined ? {} : { k: args.k });
            return {
                query: args.query,
                hits: hits.map(hit => ({
                    key: hit.key,
                    title: hit.title,
                    text: hit.text ?? '',
                    distance: hit.distance,
                })),
            };
        },
    }));
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map