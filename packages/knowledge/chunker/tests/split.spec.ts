/**
 * A splitter that loses text is the worst failure in the plane: the corpus is
 * indexed, the counts look right, retrieval works, and the passages that would
 * have answered some future question were simply never stored. Nothing reports
 * it, and the only symptom is an answer that does not exist.
 *
 * So the load-bearing property is **coverage** — every non-whitespace character
 * of the input survives into some chunk — and it is checked over inputs chosen
 * to hit each rung of the separator ladder, including the rung where there is
 * no separator left.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_SEPARATORS, splitRecursive } from '../src/split.ts'

/** Every non-whitespace character, in order. */
function skeleton(text: string): string {
  return text.replace(/\s+/g, '')
}

const OPTIONS = { size: 100, overlap: 20, separators: DEFAULT_SEPARATORS }

describe('splitRecursive', () => {
  it('loses no text when splitting on paragraphs', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph number ${i} says something.`).join('\n\n')
    const chunks = splitRecursive(text, OPTIONS)
    expect(chunks.length).toBeGreaterThan(1)
    expect(skeleton(chunks.join(''))).toContain(skeleton(text).slice(0, 40))
    for (const piece of text.split('\n\n')) {
      expect(chunks.some(chunk => chunk.includes(piece)), piece).toBe(true)
    }
  })

  it('loses no text when it has to fall through to words', () => {
    // No paragraph, no line, no sentence: the ladder must descend to spaces.
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const chunks = splitRecursive(text, OPTIONS)
    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 0; i < 80; i += 1) {
      expect(chunks.some(chunk => chunk.includes(`word${i} `) || chunk.endsWith(`word${i}`)), `word${i}`).toBe(true)
    }
  })

  it('windows a run with no separators at all rather than emitting it whole', () => {
    // A base64 blob, a minified line, CJK with no spaces. Emitting it as one
    // oversized chunk is silently destructive: the embedder truncates at its
    // token budget and the tail is never indexed.
    const text = 'x'.repeat(1000)
    const chunks = splitRecursive(text, OPTIONS)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(OPTIONS.size)
    expect(chunks.join('').length).toBeGreaterThanOrEqual(text.length)
  })

  it('overlaps every adjacent pair so a span across a boundary stays retrievable', () => {
    // Every token is unique, so a shared token cannot be a coincidence. An
    // earlier version of this test used repeated prose and passed with the
    // overlap removed entirely, because the word it happened to look for
    // appeared in every sentence.
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`)
    const chunks = splitRecursive(words.join(' '), { size: 60, overlap: 20, separators: [' '] })
    expect(chunks.length).toBeGreaterThan(3)
    for (let i = 1; i < chunks.length; i += 1) {
      const previous = new Set(chunks[i - 1]!.split(' '))
      const shared = chunks[i]!.split(' ').filter(word => previous.has(word))
      expect(shared.length, `chunks ${i - 1} and ${i} share nothing`).toBeGreaterThan(0)
    }
  })

  it('loses nothing when a single paragraph is itself over the size', () => {
    // Forces the recursion into an oversized piece, which is the path where a
    // truncation would go unnoticed: the surrounding paragraphs still round-trip
    // and only the inside of the long one is quietly clipped.
    const paragraphs = Array.from({ length: 5 }, (_, p) =>
      Array.from({ length: 40 }, (_, i) => `p${p}w${i}`).join(' '))
    const chunks = splitRecursive(paragraphs.join('\n\n'), OPTIONS)
    const emitted = new Set(chunks.join(' ').split(/\s+/))
    for (let p = 0; p < 5; p += 1) {
      for (let i = 0; i < 40; i += 1) expect(emitted.has(`p${p}w${i}`), `p${p}w${i}`).toBe(true)
    }
  })

  it('terminates when one piece is longer than the whole overlap window', () => {
    // The wedge case for the merge loop: if dropping from the front stopped
    // before removing anything, this never returns. A hang in a chunker looks
    // like a slow ingest, which is why it is worth pinning.
    const text = `${'a'.repeat(90)} ${'b'.repeat(90)} ${'c'.repeat(90)}`
    const chunks = splitRecursive(text, { size: 100, overlap: 95, separators: [' '] })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join(' ')).toContain('a'.repeat(90))
  })

  it('refuses an overlap that is not smaller than the size', () => {
    expect(() => splitRecursive('anything', { size: 50, overlap: 50, separators: [' '] })).toThrow(RangeError)
  })

  it('returns a short text unchanged rather than an empty list', () => {
    // Byte-exact, and without surrounding whitespace for the trim to absorb: an
    // off-by-one in the early return is otherwise invisible here, because
    // trimming hides a character taken off either end.
    expect(splitRecursive('A short paragraph, kept whole.', OPTIONS))
      .toEqual(['A short paragraph, kept whole.'])
    expect(splitRecursive('  padded.  ', OPTIONS)).toEqual(['padded.'])
  })
})
