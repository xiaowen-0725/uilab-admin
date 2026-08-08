import { describe, expect, it } from 'vitest'
import {
  codeLanguageFor,
  resolveDocumentFormat,
  extensionOf,
} from './format-router'

describe('resolveDocumentFormat', () => {
  it('routes markdown / text / code extensions', () => {
    expect(resolveDocumentFormat('notes/plan.md')).toBe('markdown')
    expect(resolveDocumentFormat('notes/plan.mdx')).toBe('markdown')
    expect(resolveDocumentFormat('log.txt')).toBe('text')
    expect(resolveDocumentFormat('data.json')).toBe('text')
    expect(resolveDocumentFormat('src/app.ts')).toBe('code')
    expect(resolveDocumentFormat('index.html')).toBe('code')
    expect(resolveDocumentFormat('main.py')).toBe('code')
  })

  it('marks unknown extensions unsupported (heavy formats deferred)', () => {
    expect(resolveDocumentFormat('scan.pdf')).toBe('unsupported')
    expect(resolveDocumentFormat('sheet.xlsx')).toBe('unsupported')
    expect(resolveDocumentFormat('photo.png')).toBe('unsupported')
  })

  it('maps code languages and extensions', () => {
    expect(extensionOf('a/b/c.TS')).toBe('ts')
    expect(codeLanguageFor('x.ts')).toBe('typescript')
    expect(codeLanguageFor('x.py')).toBe('python')
    expect(codeLanguageFor('x.unknownlang')).toBe('text')
  })
})
