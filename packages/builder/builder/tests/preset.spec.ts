/**
 * The generated `agent.cordis.yml` is config, not prose: a session joins
 * whatever composition this text describes, and every failure mode is a
 * silently different agent.
 *
 * The two that matter most:
 *
 * - **A dropped filesystem realm.** The read-only posture lives entirely in the
 *   generated realm group; without it the tools mount over the HOST policy —
 *   the wrong workspace and the wrong mode — and a reviewer fabricated
 *   read-only can edit the tree it reviews. Nothing errors.
 * - **A persona that breaks YAML.** Personas are free prose full of colons and
 *   quotes; an unquoted scalar parses as a mapping or not at all, and the
 *   failure lands at session creation, attributed to the roster.
 */

import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { renderAgentComposition, scaffoldTree } from '../src/preset.ts'
import type { AgentSpec } from '../src/types.ts'

/** A spec with overridable parts. */
function spec(over: Partial<AgentSpec> = {}): AgentSpec {
  return {
    name: 'reviewer',
    version: 1,
    recipe: 'recipe.code-review-agent',
    preset: 'standard',
    prompt: 'review things',
    persona: 'You review code: read-only, honest, precise. Say "cannot" when you cannot.',
    workspaceRoot: '/tmp/reviewer-workspace',
    filesystem: 'read-only',
    rows: [],
    agentRows: [
      { id: 'block.tool-fs', name: '@se373/tool-fs', block: 'block.tool-fs@1' },
      {
        id: 'block.tool-fs-search',
        name: '@se373/tool-fs-search',
        config: { sampleOverCapGlobResults: false },
        block: 'block.tool-fs-search@1',
      },
    ],
    isolates: ['agentPresets', 'settings'],
    ...over,
  }
}

/** Parse the generated composition as the loader would. */
function rows(text: string): { id: string, name: string, config?: Record<string, unknown>, isolate?: Record<string, unknown> }[] {
  return load(text) as never
}

describe('renderAgentComposition', () => {
  it('is valid YAML whose first row is the persona', () => {
    const parsed = rows(renderAgentComposition(spec()))
    expect(parsed[0]!.id).toBe('persona')
    expect(parsed[0]!.name).toBe('@se373/persona')
    expect((parsed[0]!.config as { text: string }).text).toContain('read-only, honest, precise')
  })

  it('survives a persona full of YAML syntax', () => {
    // Colons, quotes, template braces, a leading dash -- everything prose does.
    const hostile = '- You: are "an agent"; {{model}} #not a comment\n  indented: too'
    const parsed = rows(renderAgentComposition(spec({ persona: hostile })))
    expect((parsed[0]!.config as { text: string }).text).toBe(hostile)
  })

  it('emits the filesystem realm with both isolates and the right workspace', () => {
    const parsed = rows(renderAgentComposition(spec()))
    const realm = parsed.find(row => row.id === 'filesystem-realm')!
    expect(realm.isolate).toEqual({ fs: true, sandboxPolicy: true })
    const children = (realm.config as unknown) as { id: string, config?: Record<string, unknown> }[]
    const policy = children.find(child => child.id === 'sandbox-policy')!
    expect(policy.config).toEqual({ mode: 'read-only', workspaceRoot: '/tmp/reviewer-workspace' })
    // fs-sandbox must be INSIDE the realm: it resolves sandboxPolicy at
    // construction, and outside the group it would bind the host's policy.
    expect(children.some(child => child.id === 'fs-sandbox')).toBe(true)
  })

  it('places the realm before the tools that depend on it', () => {
    const parsed = rows(renderAgentComposition(spec()))
    const ids = parsed.map(row => row.id)
    expect(ids.indexOf('filesystem-realm')).toBeLessThan(ids.indexOf('block.tool-fs'))
  })

  it('omits the realm entirely when the spec composes no filesystem', () => {
    const parsed = rows(renderAgentComposition(spec({
      filesystem: null,
      agentRows: [{ id: 'block.tool-knowledge-search', name: '@se373/tool-knowledge-search', block: 'b@1' }],
    })))
    expect(parsed.some(row => row.id === 'filesystem-realm')).toBe(false)
  })

  it('carries every agent row with its config', () => {
    const parsed = rows(renderAgentComposition(spec()))
    const search = parsed.find(row => row.id === 'block.tool-fs-search')!
    expect(search.config).toEqual({ sampleOverCapGlobResults: false })
  })
})

describe('scaffoldTree', () => {
  it('lays out the preset under its own id and a bare workspace', () => {
    const tree = scaffoldTree(spec())
    expect(Object.keys(tree).sort()).toEqual([
      'preset/reviewer/agent.cordis.yml',
      'preset/reviewer/preset.yml',
      'workspace/',
    ])
    expect(tree['preset/reviewer/preset.yml']).toContain('reviewer v1')
  })
})
