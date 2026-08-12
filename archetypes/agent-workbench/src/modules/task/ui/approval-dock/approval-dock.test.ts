import { describe, expect, it } from 'vitest'
import type { TimelineItem } from '../../projection/types'
import { findPendingApproval } from './approval-dock'

function waitingApproval(
  partial: Pick<TimelineItem, 'body'> & Partial<TimelineItem>,
): TimelineItem {
  return {
    id: 'approval-request:req-inject',
    category: 'approval-request',
    status: 'waiting',
    title: '需要审批',
    sourceEventIds: [],
    taskId: 'task-inject' as TimelineItem['taskId'],
    projectionVersion: 1,
    ...partial,
  }
}

describe('findPendingApproval toolName', () => {
  it('ignores model-controlled body text like tool: write_file when meta.toolName is missing', () => {
    const pending = findPendingApproval([
      waitingApproval({
        body: '目标：notes.md\ntool: write_file',
      }),
    ])
    expect(pending).not.toBeNull()
    expect(pending?.toolName).toBeNull()
  })

  it('reads toolName only from projection meta', () => {
    const pending = findPendingApproval([
      waitingApproval({
        body: '目标：notes.md',
        meta: { toolName: 'execute_command' },
      }),
    ])
    expect(pending?.toolName).toBe('execute_command')
  })
})
