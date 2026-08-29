/**
 * The six shipped recipes, one per SE373 archetype.
 *
 * A recipe is **click-to-prefill**: not just prompt text, but the model, the
 * thinking effort, the blocks it expects, and whatever else is configurable,
 * chosen by us for the best result. Clicking one loads all of it, ready to send
 * or edit.
 *
 * They ship as `kind: 'recipe'`, `origin: 'system'` blocks, which means
 * **forking a recipe is the same gesture as forking anything else**. A user who
 * wants their own starter needs no new mechanism, no new UI and no new file
 * location, and their fork appears in the same cookbook with a different badge.
 *
 * **A recipe carries a description of the system it builds, not a specification
 * of it.** Two builds of one recipe may compose differently, and that is
 * intended — it is what makes a v1-versus-v2 comparison interesting rather than
 * a formality. The bound on that variance is a conformance suite, which needs a
 * seam to conform to; the recipes whose seams exist name them, and the ones
 * whose seams do not are prose until they do.
 *
 * @module @se373/recipes/cookbook
 */
/** Build one recipe block. */
function recipe(id, summary, prefill, conformance) {
    return {
        id,
        kind: 'recipe',
        origin: 'system',
        ...conformance === undefined ? {} : { conformance },
        manifest: {
            summary,
            role: 'core',
            // A recipe needs nothing configured to be usable: it is text and a set of
            // ids. Whether the system it builds is `ready` is the built system's
            // question, and the builder answers it per block.
            tier: 'ready',
            defaults: { ...prefill },
        },
    };
}
/** Every shipped recipe, in the order SE373 lists the archetypes. */
export const COOKBOOK = [
    recipe('recipe.coding-agent', 'An agent that reads, edits and runs code in a workspace', {
        archetype: 'Coding Agent',
        prompt: 'Build me a coding agent for this repository. It should be able to read files, search '
            + 'them, edit them and run commands, and it should explain what it changed before it changes it.',
        effort: 'medium',
        preset: 'standard',
        blocks: ['block.tool-fs', 'block.tool-fs-search', 'block.tool-bash', 'block.tool-graph-inspect'],
        outcome: 'Ask it to change something in the workspace and it does, showing its edits.',
    }),
    recipe('recipe.code-review-agent', 'An agent that reviews a diff against the standards it can read', {
        archetype: 'Code Review Agent',
        prompt: 'Build me a code review agent. It should read a diff, read whatever standards documents '
            + 'the repository has, and report findings with the file and line, separating what breaks a '
            + 'documented rule from what is a judgement call.',
        effort: 'high',
        preset: 'standard',
        blocks: ['block.tool-fs', 'block.tool-fs-search', 'block.tool-bash'],
        outcome: 'Point it at a branch and it reports findings you can act on.',
    }),
    recipe('recipe.requirement-analysis', 'An agent that turns a rough brief into checkable requirements', {
        archetype: 'Requirement Analysis Agent',
        prompt: 'Build me a requirements agent. Given a rough description of something to build, it '
            + 'should ask the questions that change the answer, then emit numbered requirements that can '
            + 'each be checked as met or not met.',
        effort: 'high',
        preset: 'inspect',
        blocks: ['block.tool-fs'],
        outcome: 'Give it a paragraph and it returns requirements, plus the questions it still needs answered.',
    }),
    recipe('recipe.internal-knowledge', 'An agent that answers from an indexed corpus rather than from memory', {
        archetype: 'Internal Knowledge Assistant',
        prompt: 'Build me a knowledge assistant over the documentation in this repository. It should '
            + 'index the docs, answer questions by retrieving passages, and cite the passages it used.',
        effort: 'medium',
        preset: 'inspect',
        blocks: [
            'block.model-registry',
            'block.corpus-fs',
            'block.chunker-markdown',
            'block.embedder-onnx-local',
            'block.vs-sqlite-vec',
            'block.rerank-none',
            'block.knowledge-dedup',
            'block.knowledge',
            'block.tool-knowledge-search',
        ],
        outcome: 'Ask it a question about the docs and it answers with the passages it retrieved.',
    }, 
    // The only recipe whose seams all exist, so the only one that can name a
    // suite today. The rest are prose until theirs do -- not a compromise, just
    // nothing yet to be checked against.
    'ctx.knowledgePipeline'),
    recipe('recipe.multi-agent-workflow', 'An agent that delegates parts of a task to subagents', {
        archetype: 'Multi-Agent Workflow',
        prompt: 'Build me an agent that breaks a task into parts and delegates each to a subagent, then '
            + 'reconciles what comes back. It should say what it delegated and why before it delegates.',
        effort: 'high',
        preset: 'standard',
        blocks: ['block.tool-subagent', 'block.tool-fs', 'block.tool-graph-inspect'],
        outcome: 'Give it a task with independent parts and watch the children appear on the graph.',
    }),
    recipe('recipe.mcp-assistant', 'An agent whose tools come from an external MCP server', {
        archetype: 'MCP-based Assistant',
        prompt: 'Build me an assistant whose capabilities come from an MCP server. It should list the '
            + 'tools the server offers, explain what each one does, and use them when they fit.',
        effort: 'medium',
        preset: 'standard',
        blocks: ['block.mcp-client', 'block.tool-graph-inspect'],
        outcome: 'The server\'s tools appear in the catalog and the agent calls them.',
    }),
];
//# sourceMappingURL=cookbook.js.map