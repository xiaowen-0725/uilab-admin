import { describe, expect, it } from 'vitest'
import {
  coerceWorkspaceResourceKey,
  normalizeWorkspaceResourceKey,
  looksLikeWorkspacePath,
  toWorkspaceResourceKey,
} from './path-utils'

describe('normalizeWorkspaceResourceKey', () => {
  it('normalizes relative paths and strips leading slash', () => {
    expect(normalizeWorkspaceResourceKey('/docs/a.md')).toBe('docs/a.md')
    expect(normalizeWorkspaceResourceKey('./src/x.ts')).toBe('src/x.ts')
    expect(normalizeWorkspaceResourceKey('fixture/notes/plan.txt')).toBe(
      'fixture/notes/plan.txt',
    )
  })

  it('rejects parent escape and empty', () => {
    expect(normalizeWorkspaceResourceKey('../secret')).toBeNull()
    expect(normalizeWorkspaceResourceKey('a/../../b')).toBeNull()
    expect(normalizeWorkspaceResourceKey('')).toBeNull()
    expect(normalizeWorkspaceResourceKey('   ')).toBeNull()
  })

  it('rejects absolute / URL forms', () => {
    expect(normalizeWorkspaceResourceKey('https://example.com/a')).toBeNull()
    expect(normalizeWorkspaceResourceKey('C:\\Windows\\x')).toBeNull()
  })

  it('looksLikeWorkspacePath mirrors coerce success', () => {
    expect(looksLikeWorkspacePath('a/b.md')).toBe(true)
    expect(looksLikeWorkspacePath('..')).toBe(false)
    expect(
      looksLikeWorkspacePath('/Users/me/ws/output/report.md'),
    ).toBe(true)
  })
})

describe('coerceWorkspaceResourceKey', () => {
  it('peels host absolute paths at virtual markers', () => {
    expect(
      coerceWorkspaceResourceKey(
        '/Users/me/VoltAgent-Office/workspace/output/report.md',
      ),
    ).toBe('output/report.md')
    expect(
      coerceWorkspaceResourceKey('/tmp/ws/notes/seed.md'),
    ).toBe('notes/seed.md')
    expect(
      coerceWorkspaceResourceKey('/repo/skills/pack/SKILL.md'),
    ).toBe('skills/pack/SKILL.md')
  })

  it('uses the last matching virtual marker', () => {
    expect(
      coerceWorkspaceResourceKey('/outer/notes/x/output/inner.txt'),
    ).toBe('output/inner.txt')
  })

  it('keeps already-relative workspace keys', () => {
    expect(coerceWorkspaceResourceKey('output/a.md')).toBe('output/a.md')
    expect(coerceWorkspaceResourceKey('/output/a.md')).toBe('output/a.md')
    expect(coerceWorkspaceResourceKey('fixture/notes/plan.txt')).toBe(
      'fixture/notes/plan.txt',
    )
  })

  it('rejects URLs, escapes, and empty', () => {
    expect(coerceWorkspaceResourceKey('https://example.com/a')).toBeNull()
    expect(coerceWorkspaceResourceKey('file:///tmp/x')).toBeNull()
    expect(coerceWorkspaceResourceKey('../secret')).toBeNull()
    expect(coerceWorkspaceResourceKey('')).toBeNull()
  })

  it('allows filenames that contain ".." as characters (not segment escape)', () => {
    expect(normalizeWorkspaceResourceKey('notes/v1..v2.md')).toBe(
      'notes/v1..v2.md',
    )
    expect(toWorkspaceResourceKey('notes/v1..v2.md')).toBe('notes/v1..v2.md')
  })
})

describe('toWorkspaceResourceKey', () => {
  it('is the preferred public alias of coerceWorkspaceResourceKey', () => {
    expect(toWorkspaceResourceKey).toBe(coerceWorkspaceResourceKey)
    expect(toWorkspaceResourceKey('output/a.md')).toBe('output/a.md')
    expect(toWorkspaceResourceKey('/tmp/ws/notes/seed.md')).toBe('notes/seed.md')
    expect(toWorkspaceResourceKey('../secret')).toBeNull()
  })
})
