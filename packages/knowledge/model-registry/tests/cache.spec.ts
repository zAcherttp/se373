/**
 * `resolve` deciding a model is present when it is not — or, worse, when it is
 * half-present — is a failure that surfaces hundreds of lines away, as an ONNX
 * loader error about a corrupt graph, with nothing pointing back at the
 * download that was interrupted.
 *
 * Size is the only cheap check available (hashing 300 MB per boot is not an
 * option), so the question these specs ask is whether the cheap check actually
 * catches the realistic corruption.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { modelDir, resolveRow, verifyRow } from '../src/cache.ts'
import type { ModelRow } from '../src/types.ts'

const root = mkdtempSync(join(tmpdir(), 'se373-model-cache-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

/** sha256 of 'hello' and of 'hi', precomputed. */
const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

const ROW: ModelRow = {
  id: 'fixture',
  repo: 'acme/encoder',
  revision: '0'.repeat(40),
  files: {
    onnx: 'onnx/model.onnx',
    onnxData: 'onnx/model.onnx_data',
    tokenizer: 'tokenizer.json',
    tokenizerConfig: 'tokenizer_config.json',
  },
  artifacts: [
    { file: 'onnx/model.onnx', sha256: HELLO, bytes: 5 },
    { file: 'onnx/model.onnx_data', sha256: HELLO, bytes: 5 },
    { file: 'tokenizer.json', sha256: HELLO, bytes: 5 },
    { file: 'tokenizer_config.json', sha256: HELLO, bytes: 5 },
  ],
  nativeDims: 8,
  dims: 8,
  mrlDims: [8],
  maxTokens: 128,
  templates: { document: 'd: {content}', query: 'q: {content}' },
  normalize: true,
  license: 'mit',
  summary: 'fixture',
}

/** Lay down a row's files, optionally corrupting one. */
function populate(row: ModelRow, damage: { file: string, content: string } | null): void {
  const dir = modelDir(root, row)
  rmSync(dir, { recursive: true, force: true })
  for (const artifact of row.artifacts) {
    const path = join(dir, artifact.file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, damage?.file === artifact.file ? damage.content : 'hello')
  }
}

describe('resolveRow', () => {
  it('mirrors repository paths so an external-data sidecar lands beside its graph', () => {
    // ONNX records the sidecar's name INSIDE the graph as a bare relative
    // filename, so flattening the layout breaks loading at inference time only.
    const dir = modelDir(root, ROW)
    expect(dir.endsWith(join('acme', 'encoder', ROW.revision))).toBe(true)
  })

  it('reports every absent file, not just the first', async () => {
    rmSync(modelDir(root, ROW), { recursive: true, force: true })
    const state = await resolveRow(root, ROW)
    expect(state.status).toBe('missing')
    if (state.status !== 'missing') return
    expect(state.missing).toHaveLength(4)
    expect(state.bytes).toBe(20)
  })

  it('treats a truncated file as missing', async () => {
    // The realistic corruption: an interrupted transfer. A byte-length check is
    // the whole defence, and without it this resolves as ready.
    populate(ROW, { file: 'onnx/model.onnx_data', content: 'hi' })
    const state = await resolveRow(root, ROW)
    expect(state.status).toBe('missing')
    if (state.status !== 'missing') return
    expect(state.missing).toEqual(['onnx/model.onnx_data'])
  })

  it('names the remedy, including the licence and the command', async () => {
    populate(ROW, { file: 'tokenizer.json', content: '' })
    const state = await resolveRow(root, ROW)
    if (state.status !== 'missing') throw new Error('expected missing')
    expect(state.remedy).toContain('pnpm models:acquire fixture')
    expect(state.remedy).toContain('mit')
  })

  it('resolves complete files to absolute per-slot paths', async () => {
    populate(ROW, null)
    const state = await resolveRow(root, ROW)
    expect(state.status).toBe('ready')
    if (state.status !== 'ready') return
    expect(state.paths.onnx.endsWith(join('onnx', 'model.onnx'))).toBe(true)
    expect(state.paths.onnxData?.endsWith(join('onnx', 'model.onnx_data'))).toBe(true)
  })
})

describe('verifyRow', () => {
  it('catches wrong bytes at the right length, which resolve cannot', async () => {
    // Same size, different content. This is precisely the gap `resolve`
    // documents leaving open, so the expensive check has to close it.
    populate(ROW, { file: 'tokenizer.json', content: 'HELLO' })
    expect((await resolveRow(root, ROW)).status).toBe('ready')
    expect(await verifyRow(root, ROW)).toEqual(['tokenizer.json'])
  })

  it('passes when every digest matches', async () => {
    populate(ROW, null)
    expect(await verifyRow(root, ROW)).toEqual([])
  })
})
