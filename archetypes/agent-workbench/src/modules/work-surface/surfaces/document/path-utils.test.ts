import { describe, expect, it } from 'vitest'
import {
  normalizeWorkspaceResourceKey,
  looksLikeWorkspacePath,
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

  it('looksLikeWorkspacePath mirrors normalize success', () => {
    expect(looksLikeWorkspacePath('a/b.md')).toBe(true)
    expect(looksLikeWorkspacePath('..')).toBe(false)
  })
})
