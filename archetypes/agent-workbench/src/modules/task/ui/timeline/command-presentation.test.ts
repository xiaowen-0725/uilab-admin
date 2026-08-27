import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../projection/types'
import {
  commandInputText,
  commandRunStatus,
  commandRunStatusLabel,
  presentCommandOutput,
} from './command-presentation'

function item(partial: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'c1',
    category: 'command-execution',
    sourceEventIds: [],
    taskId: 'task-1',
    projectionVersion: 1,
    ...partial,
  }
}

describe('commandInputText', () => {
  it('prefers the raw command on meta', () => {
    expect(
      commandInputText(
        item({
          title: '已执行 …sort -rn',
          meta: { command: 'find /tmp -type f | sort -rn' },
        }),
      ),
    ).toBe('find /tmp -type f | sort -rn')
  })

  it('strips the activity prefix when meta is missing', () => {
    expect(commandInputText(item({ title: '正在执行 sleep 4' }))).toBe('sleep 4')
  })
})

describe('commandRunStatus', () => {
  it('maps terminal statuses', () => {
    expect(commandRunStatus('running')).toBe('running')
    expect(commandRunStatus('completed')).toBe('success')
    expect(commandRunStatus('error')).toBe('failed')
    expect(commandRunStatusLabel('success')).toBe('运行成功')
    expect(commandRunStatusLabel('failed')).toBe('运行失败')
  })
})

describe('presentCommandOutput', () => {
  it('keeps a plain sandbox sentence', () => {
    expect(
      presentCommandOutput(
        "cwd '/' is outside of sandbox root '/tmp/workspace'",
      ),
    ).toBe("cwd '/' is outside of sandbox root '/tmp/workspace'")
  })

  it('extracts stderr from a shell result JSON dump', () => {
    expect(
      presentCommandOutput(
        JSON.stringify({
          success: false,
          exit_code: 1,
          stderr: '|: unknown primary or operator\n',
          stdout_truncated: false,
          summary: 'Exit code: 1\nDuration: 119 ms\nSTDOUT: (empty)',
        }),
      ),
    ).toBe('|: unknown primary or operator')
  })

  it('hides protocol JSON that has no stream text', () => {
    expect(
      presentCommandOutput(
        JSON.stringify({
          success: false,
          exit_code: 1,
          stdout_truncated: false,
          summary: 'Exit code: 1\nDuration: 119 ms',
        }),
      ),
    ).toBeUndefined()
  })
})
