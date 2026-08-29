/**
 * Block manifests for the packages this harness ships.
 *
 * §6.1 says one file per block, living with the block. This is one file for all
 * of them, and that is a **deliberate shortcut with a cost**: a manifest here can
 * drift from the package it describes, and nothing but this file's own invariant
 * would notice. The reason to accept it for now is that the alternative —
 * sixteen packages each gaining a manifest and a registration row — is a change
 * to sixteen packages in service of a registry that has not yet been used for
 * anything. When authoring lands at 6d and forks start naming parents, the
 * manifests move to their packages and this file becomes the seed for the
 * vendored ones only.
 *
 * Tiers are I2's, and they are the field that decides what a fabricated agent
 * can do on arrival: `ready` and `defaulted` blocks run, `blocked` blocks mount
 * inert and say what they need.
 *
 * @module @se373/system-blocks/manifests
 */

import type { BlockInput } from '@se373/block-registry'

/** Build one system block. */
function block(
  id: string,
  plugin: string,
  summary: string,
  extra: Partial<BlockInput['manifest']> = {},
): BlockInput {
  return {
    id: `block.${id}`,
    kind: 'agent',
    origin: 'system',
    manifest: { summary, plugin, tier: 'ready', ...extra },
  }
}

/** Every block the shipped packages offer a builder. */
export const SYSTEM_BLOCKS: readonly BlockInput[] = [
  // --- tools ------------------------------------------------------------------
  block('tool-fs', '@se373/tool-fs', 'Read, write and edit files in the workspace', {
    role: 'tool',
    mount: 'agent',
    inject: ['tools', 'fs'],
  }),
  block('tool-fs-search', '@se373/tool-fs-search', 'Grep and glob across the workspace', {
    role: 'tool',
    mount: 'agent',
    inject: ['tools'],
    // Required by the tool's own schema -- it has no default upstream, and the
    // shipped inspect preset sets exactly this. A manifest default is what
    // makes composing the block not require knowing that.
    defaults: { sampleOverCapGlobResults: false },
  }),
  block('tool-bash', '@se373/tool-bash', 'Run shell commands in the workspace', {
    role: 'tool',
    mount: 'agent',
    inject: ['tools', 'bash'],
  }),
  block('tool-subagent', '@se373/tool-subagent', 'Delegate a task to a subagent', {
    role: 'tool',
    mount: 'agent',
    inject: ['tools', 'subagents'],
  }),
  block('tool-graph-inspect', '@se373/tool-graph-inspect', 'Inspect the plugin runtime from inside it', {
    role: 'tool',
    mount: 'agent',
    inject: ['tools', 'runtimeGraph', 'systemPrompt'],
  }),
  block('tool-knowledge-search', '@se373/tool-knowledge-search', 'Search the indexed knowledge base by meaning', {
    role: 'tool',
    // Agent-plane: it registers into the per-agent tool catalog, while its
    // `knowledgePipeline` injection resolves through the roster's realm to the
    // fabricated subtree. That split is the whole point of `mount`.
    mount: 'agent',
    inject: ['tools', 'knowledgePipeline', 'systemPrompt'],
  }),

  // --- the knowledge write path, in cascade order -----------------------------
  block('model-registry', '@se373/model-registry', 'Declared model rows and the cache behind them', {
    role: 'core',
    // A core service with no alternatives, so it has no seam -- but a row that
    // injects it still needs the builder to know it will be there.
    provides: ['modelRegistry'],
    // The weights are a download away, not a secret. A model that is absent
    // mounts blocked and says so, which is the tier's own behaviour rather than
    // a claim made here.
    tier: 'defaulted',
  }),
  block('corpus-fs', '@se373/corpus-fs', 'Documents from a directory tree', {
    role: 'provider',
    seam: 'ctx.corpusSources',
    tier: 'defaulted',
    indexInvalidating: true,
    defaults: { roots: ['docs'], extensions: ['.md'] },
  }),
  block('chunker-markdown', '@se373/chunker-markdown', 'Split Markdown at its headings', {
    role: 'provider',
    seam: 'ctx.chunker',
    indexInvalidating: true,
  }),
  block('chunker-recursive', '@se373/chunker-recursive', 'Split any text by recursive character splitting', {
    role: 'provider',
    seam: 'ctx.chunker',
    indexInvalidating: true,
  }),
  block('embedder-onnx-local', '@se373/embedder-onnx-local', 'Embed text locally with an ONNX encoder', {
    role: 'provider',
    seam: 'ctx.embedder',
    tier: 'defaulted',
    indexInvalidating: true,
    inject: ['modelRegistry'],
  }),
  block('vs-sqlite-vec', '@se373/vs-sqlite-vec', 'Store vectors in one SQLite file per generation', {
    role: 'provider',
    seam: 'ctx.vectorStore',
    tier: 'defaulted',
    indexInvalidating: false,
  }),

  // --- the read path ----------------------------------------------------------
  block('rerank-none', '@se373/rerank-none', 'Keep vector order and reduce to top-k', {
    role: 'provider',
    seam: 'ctx.reranker',
  }),
  block('knowledge-dedup', '@se373/knowledge-dedup', 'Cap how many passages one document may contribute', {
    role: 'listener',
  }),
  block('knowledge', '@se373/knowledge', 'Compose the four stages, own the generation key', {
    role: 'core',
    seam: 'ctx.knowledgePipeline',
    inject: ['corpusSources', 'chunker', 'embedder', 'vectorStore'],
  }),

  // --- external, and therefore blocked ---------------------------------------
  block('mcp-client', '@se373/mcp-client', 'Adopt the tools an external MCP server offers', {
    role: 'core',
    // The one genuinely blocked block we ship: it needs a server to talk to,
    // and I2 says connecting one *upgrades* an agent rather than enabling it.
    tier: 'blocked',
    requires: ['an MCP server command or endpoint'],
  }),
]
