import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTO_APPROVE_WRITE_TOOLS,
  autoApproveReason,
  decideApprovalResponse,
  DEFAULT_PERMISSION_PRESET,
  getPermissionPreset,
  resetPermissionPresetStoreForTests,
  setPermissionPreset,
} from './permission-preset'

describe('decideApprovalResponse', () => {
  it('auto-approve: whitelist write tools approve; execute_command and unknown dock', () => {
    for (const tool of AUTO_APPROVE_WRITE_TOOLS) {
      expect(decideApprovalResponse('auto-approve', tool)).toBe('approve')
    }
    expect(decideApprovalResponse('auto-approve', 'execute_command')).toBe(
      'dock',
    )
    expect(decideApprovalResponse('auto-approve', 'unknown_tool')).toBe('dock')
    expect(decideApprovalResponse('auto-approve', 'WRITE_FILE')).toBe('dock')
    expect(decideApprovalResponse('auto-approve', null)).toBe('dock')
    expect(decideApprovalResponse('auto-approve', undefined)).toBe('dock')
    expect(decideApprovalResponse('auto-approve', '')).toBe('dock')
    expect(AUTO_APPROVE_WRITE_TOOLS).not.toContain('ask_user_question')
    expect(decideApprovalResponse('auto-approve', 'ask_user_question')).toBe(
      'dock',
    )
  })

  it('full-access: every tool name (including unknown) approves', () => {
    expect(decideApprovalResponse('full-access', 'write_file')).toBe('approve')
    expect(decideApprovalResponse('full-access', 'execute_command')).toBe(
      'approve',
    )
    expect(decideApprovalResponse('full-access', 'unknown_tool')).toBe(
      'approve',
    )
    expect(decideApprovalResponse('full-access', null)).toBe('approve')
  })

  it('emits Chinese auto-approve reasons per preset', () => {
    expect(autoApproveReason('auto-approve')).toBe(
      '已按「帮我批准」预设自动批准',
    )
    expect(autoApproveReason('full-access')).toBe(
      '已按「完全访问」预设自动批准',
    )
  })
})

describe('permission preset store', () => {
  beforeEach(() => {
    resetPermissionPresetStoreForTests()
  })

  it('defaults to auto-approve and isolates per Task', () => {
    expect(DEFAULT_PERMISSION_PRESET).toBe('auto-approve')
    expect(getPermissionPreset('task-a')).toBe('auto-approve')
    setPermissionPreset('task-a', 'full-access')
    expect(getPermissionPreset('task-a')).toBe('full-access')
    expect(getPermissionPreset('task-b')).toBe('auto-approve')
  })

  it('new Task and missing id fall back to auto-approve', () => {
    setPermissionPreset('task-a', 'full-access')
    expect(getPermissionPreset('task-brand-new')).toBe('auto-approve')
    expect(getPermissionPreset(null)).toBe('auto-approve')
    expect(getPermissionPreset('')).toBe('auto-approve')
  })

  it('restores a Task preset from localStorage after memory reset', () => {
    setPermissionPreset('task-a', 'full-access')
    resetPermissionPresetStoreForTests({ persistStorage: true })
    expect(getPermissionPreset('task-a')).toBe('full-access')
    expect(getPermissionPreset('task-b')).toBe('auto-approve')
  })
})
