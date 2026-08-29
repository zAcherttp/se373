/**
 * Two silent failures, both found by reading the demo's own output rather than
 * by reasoning about the code.
 *
 * **A `#` inside a fenced code block read as a heading.** `docs/` here is full
 * of shell blocks whose comments start with `#`; treating each as a section
 * boundary cuts documents apart at commented commands and produces chunks that
 * begin mid-thought. Nothing errors, and the damage is only visible as slightly
 * worse retrieval.
 *
 * **A chunk containing nothing but its heading.** The first version prepended
 * the heading to a section and *then* split, so a long section could emit a
 * span that was the heading alone: maximum title signal, zero information. It
 * then attracted every query whose words resembled that heading. Both of the
 * headings this produced in practice were `Known Limitations and Deferred Work`
 * — which every README in the repository has.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@se373/cordis'
import { contentDigest } from '@se373/digest'
import type { Document } from '@se373/corpus'
import { MarkdownChunker, sections } from '../src/index.ts'

/** A document from raw text. */
function document(text: string): Document {
  return { id: 'doc.md', text, title: null, contentHash: contentDigest(text), metadata: {} }
}

/** A chunker with the given config, on a bare context. */
function chunker(config: Record<string, number> = {}): MarkdownChunker {
  return new MarkdownChunker(new Context() as never, config)
}

describe('sections', () => {
  it('does not treat a comment inside a fence as a heading', () => {
    const text = [
      '# Real heading',
      '',
      '```bash',
      '# not a heading, a shell comment',
      'pnpm models:acquire',
      '```',
      '',
      'Body text after the fence.',
    ].join('\n')
    expect(sections(text).map(section => section.heading)).toEqual(['Real heading'])
  })

  it('closes a fence only on its own delimiter', () => {
    const text = ['# H', '', '~~~', '```', '# still inside the tilde fence', '~~~', '', 'after'].join('\n')
    expect(sections(text).map(section => section.heading)).toEqual(['H'])
  })

  it('splits at real headings of every depth', () => {
    const text = ['# One', 'a', '## Two', 'b', '###### Six', 'c'].join('\n')
    expect(sections(text).map(section => section.heading)).toEqual(['One', 'Two', 'Six'])
  })
})

describe('MarkdownChunker', () => {
  it('never emits a chunk that is only its heading', () => {
    // A section far longer than `size`, so it must be split. Every span has to
    // come back carrying real body text.
    const body = Array.from({ length: 60 }, (_, i) => `Sentence ${i} of the long section.`).join(' ')
    const chunks = chunker({ size: 200, overlap: 40, minSize: 50 })
      .chunk(document(`# Doc\n\n## Known Limitations and Deferred Work\n\n${body}\n`))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const withoutHeading = chunk.text.replace(/^.*\n\n/, '').trim()
      expect(withoutHeading, chunk.key).not.toBe('')
      expect(chunk.text.trim(), chunk.key).not.toBe(chunk.title)
    }
  })

  it('gives every span of a long section its heading, not just the first', () => {
    const body = Array.from({ length: 60 }, (_, i) => `Sentence ${i} of the long section.`).join(' ')
    const chunks = chunker({ size: 200, overlap: 40, minSize: 50 })
      .chunk(document(`## Retention policy\n\n${body}\n`))
    expect(chunks.length).toBeGreaterThan(1)
    // The heading is the strongest retrieval signal the section has; a span
    // that lost it is a span nothing will find by topic.
    for (const chunk of chunks) expect(chunk.text.startsWith('Retention policy'), chunk.key).toBe(true)
  })

  it('merges a section too short to stand alone into the next one', () => {
    const chunks = chunker({ size: 900, overlap: 100, minSize: 200 })
      .chunk(document(['# Doc', '', '## Tiny', '', 'Two words.', '', '## Real', '', 'x'.repeat(400)].join('\n')))
    expect(chunks.some(chunk => chunk.text.includes('Two words.'))).toBe(true)
    // Not as its own chunk: a two-line section retrieves nothing useful alone.
    expect(chunks.some(chunk => chunk.text.trim().endsWith('Two words.'))).toBe(false)
  })

  it('keeps a trailing short section rather than dropping it', () => {
    // The end of a document is exactly where a short section is likely, and
    // dropping it loses content with no trace.
    const chunks = chunker({ size: 900, overlap: 100, minSize: 200 })
      .chunk(document(['# Doc', '', '## Body', '', 'y'.repeat(400), '', '## Coda', '', 'Last words.'].join('\n')))
    expect(chunks.some(chunk => chunk.text.includes('Last words.'))).toBe(true)
  })

  it('carries the document hash onto every chunk', () => {
    // Incremental re-ingest reads this back off the index to decide what
    // changed; a chunk without it is a document that always looks new.
    const doc = document('# Doc\n\nSome body text that is long enough to keep.\n')
    for (const chunk of chunker().chunk(doc)) expect(chunk.documentHash).toBe(doc.contentHash)
  })
})
