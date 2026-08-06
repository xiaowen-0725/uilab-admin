import { describe, expect, it } from 'vitest'
import {
  classifyToolActivity,
  extractToolObject,
  formatToolActivityCopy,
  liveStatusForToolActivity,
} from './tool-activity-copy'

describe('tool-activity-copy', () => {
  it('formats read_file running/completed with path from args', () => {
    expect(
      formatToolActivityCopy({
        name: 'read_file',
        args: { path: 'ai-tells.md' },
        status: 'running',
      }),
    ).toBe('正在读取 ai-tells.md')
    expect(
      formatToolActivityCopy({
        name: 'read_file',
        args: { path: 'ai-tells.md' },
        status: 'completed',
      }),
    ).toBe('已读取 ai-tells.md')
  })

  it('formats ls listing', () => {
    expect(
      liveStatusForToolActivity({
        name: 'ls',
        args: { path: '/' },
      }),
    ).toBe('正在列出 /')
    expect(
      formatToolActivityCopy({
        name: 'ls',
        args: { path: '/' },
        status: 'completed',
      }),
    ).toBe('已列出 /')
  })

  it('keeps phase-aligned Chinese fixture labels', () => {
    expect(
      formatToolActivityCopy({
        name: 'read_file',
        label: '已读取 plan.txt',
        status: 'completed',
      }),
    ).toBe('已读取 plan.txt')
  })

  it('maps web search label to live search copy', () => {
    expect(
      liveStatusForToolActivity({
        name: 'web_search',
        label: '搜索网页',
      }),
    ).toBe('正在搜索网页…')
  })

  it('extracts object from items when args missing', () => {
    expect(
      extractToolObject({
        name: 'read',
        items: ['fixture/notes/plan.txt'],
      }),
    ).toBe('fixture/notes/plan.txt')
  })

  it('classifies common tools', () => {
    expect(classifyToolActivity('read_file', null)).toBe('read')
    expect(classifyToolActivity('write_file', null)).toBe('write')
    expect(classifyToolActivity('run_command', null)).toBe('command')
  })
})
