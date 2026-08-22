import { describe, expect, it } from 'vitest'
import { formatRelativeTimeZh } from './relative-time'

const NOW = Date.parse('2026-08-22T12:00:00.000Z')

describe('formatRelativeTimeZh', () => {
  it('uses 刚刚 / 分钟 / 小时 / 天前', () => {
    expect(formatRelativeTimeZh('2026-08-22T11:59:40.000Z', NOW)).toBe('刚刚')
    expect(formatRelativeTimeZh('2026-08-22T11:50:00.000Z', NOW)).toBe(
      '10分钟前',
    )
    expect(formatRelativeTimeZh('2026-08-22T09:00:00.000Z', NOW)).toBe(
      '3小时前',
    )
    expect(formatRelativeTimeZh('2026-08-14T12:00:00.000Z', NOW)).toBe('8天前')
  })

  it('returns empty for invalid timestamps', () => {
    expect(formatRelativeTimeZh('not-a-date', NOW)).toBe('')
  })
})
