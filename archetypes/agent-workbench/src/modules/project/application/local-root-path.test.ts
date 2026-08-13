import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKBENCH_PRODUCT_PROFILE } from '@/config/workbench-product-profile'
import {
  basenameOfRoot,
  expandHome,
  normalizeLocalRoot,
  resolveProjectsHomePath,
  sanitizeDirectoryName,
  uniqueChildDirectoryName,
} from './local-root-path'

describe('normalizeLocalRoot', () => {
  it('absolute-izes separators, strips trailing slashes, collapses . and ..', () => {
    expect(normalizeLocalRoot('/Users/foo/bar/')).toBe('/Users/foo/bar')
    expect(normalizeLocalRoot('/Users/foo/./bar/../baz')).toBe('/Users/foo/baz')
    expect(normalizeLocalRoot('/Users/foo//bar')).toBe('/Users/foo/bar')
    expect(normalizeLocalRoot('C:\\Users\\foo\\bar\\')).toBe('C:/Users/foo/bar')
  })

  it('does not fold case', () => {
    expect(normalizeLocalRoot('/Users/Foo/Bar')).toBe('/Users/Foo/Bar')
    expect(normalizeLocalRoot('/Users/Foo/Bar')).not.toBe('/Users/foo/bar')
  })

  it('keeps filesystem root', () => {
    expect(normalizeLocalRoot('/')).toBe('/')
    expect(normalizeLocalRoot('/.')).toBe('/')
  })

  it('rejects empty and relative paths with Chinese errors', () => {
    expect(() => normalizeLocalRoot('')).toThrow(/路径无效/)
    expect(() => normalizeLocalRoot('   ')).toThrow(/路径无效/)
    expect(() => normalizeLocalRoot('relative/path')).toThrow(/绝对路径/)
    expect(() => normalizeLocalRoot('./foo')).toThrow(/绝对路径/)
  })
})

describe('basenameOfRoot / expandHome / resolveProjectsHomePath', () => {
  it('takes the last segment as the display name', () => {
    expect(basenameOfRoot('/Users/me/AgentWorkbench/demo')).toBe('demo')
  })

  it('expands ~ against the given home', () => {
    expect(expandHome('~', '/Users/me')).toBe('/Users/me')
    expect(expandHome('~/AgentWorkbench', '/Users/me')).toBe(
      '/Users/me/AgentWorkbench',
    )
  })

  it('resolves Projects Home from profile defaults and override', () => {
    expect(
      resolveProjectsHomePath('/Users/me', DEFAULT_WORKBENCH_PRODUCT_PROFILE),
    ).toBe('/Users/me/AgentWorkbench')
    expect(
      resolveProjectsHomePath('/Users/me', {
        projectsHomeDirName: 'AgentWorkbench',
        projectsHomeOverride: '/opt/projects',
      }),
    ).toBe('/opt/projects')
    expect(
      resolveProjectsHomePath('/Users/me', {
        projectsHomeDirName: 'AgentWorkbench',
        projectsHomeOverride: '~/CustomHome',
      }),
    ).toBe('/Users/me/CustomHome')
  })
})

describe('uniqueChildDirectoryName', () => {
  it('returns the sanitized preferred name when free', () => {
    expect(uniqueChildDirectoryName('demo', [])).toBe('demo')
    expect(sanitizeDirectoryName('a/b:c')).toBe('a-b-c')
  })

  it('adds a timestamp suffix on conflict, then a numeric suffix', () => {
    const now = new Date('2026-08-13T05:42:00')
    const first = uniqueChildDirectoryName('demo', ['demo'], now)
    expect(first).toBe('demo-20260813-054200')
    const second = uniqueChildDirectoryName(
      'demo',
      ['demo', 'demo-20260813-054200'],
      now,
    )
    expect(second).toBe('demo-20260813-054200-2')
  })
})
