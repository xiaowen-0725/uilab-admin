import { describe, expect, it } from 'vitest'
import { localTitleFromPrompt, UNTITLED_TASK_FALLBACK } from './title-policy'

describe('localTitleFromPrompt (design §6 examples)', () => {
  it('trims, takes first non-empty line, collapses internal whitespace', () => {
    expect(localTitleFromPrompt('  修复   登录\n请检查 token  ')).toBe('修复 登录')
  })

  it('slash-only first non-empty line falls back (next line not used)', () => {
    expect(localTitleFromPrompt('\n  /plan   \n下一行内容')).toBe(UNTITLED_TASK_FALLBACK)
  })

  it('strips ASCII slash command token then collapses remainder', () => {
    expect(localTitleFromPrompt('/fix_v2   修复   登录！')).toBe('修复 登录！')
  })

  it('does not strip slash when token is not pure ASCII', () => {
    expect(localTitleFromPrompt('/修复   登录')).toBe('/修复 登录')
  })

  it('caps at 24 graphemes and appends ellipsis', () => {
    expect(localTitleFromPrompt('abcdefghijklmnopqrstuvwxyz')).toBe(
      'abcdefghijklmnopqrstuvwx…',
    )
  })

  it('empty / whitespace-only → fallback', () => {
    expect(localTitleFromPrompt('')).toBe(UNTITLED_TASK_FALLBACK)
    expect(localTitleFromPrompt('   \n  \n')).toBe(UNTITLED_TASK_FALLBACK)
  })
})
