import { describe, expect, it } from 'vitest'
import {
  previewText,
  runtimeHonestyCopy,
  VOLTAGENT_RUNTIME_HONESTY_COPY,
} from './runtime-honesty'

describe('VOLTAGENT_RUNTIME_HONESTY_COPY', () => {
  it('discloses local sidecar Runtime and never claims Fake', () => {
    const c = VOLTAGENT_RUNTIME_HONESTY_COPY
    expect(c.banner).toMatch(/本机 VoltAgent/)
    expect(c.banner).toMatch(/非远程生产集群/)
    expect(c.timelineAriaLabel).toMatch(/本机 VoltAgent/)
    expect(c.banner).not.toMatch(/Fake/)
    expect(c.emptyTimeline).toMatch(/执行记录/)
    expect(c.emptyTimeline).not.toMatch(/Fake/i)
    expect(c.waitingInput).toMatch(/回答|直接回复/)
    expect(c.waitingInput).not.toMatch(/provideRunInput|Fake/i)
    expect(c.submitAccepted).not.toMatch(/Fake/)
    expect(c.cancelAccepted).toMatch(/本机 VoltAgent/)
    expect(c.cancelAccepted).toMatch(/非远程生产集群/)
    expect(c).not.toHaveProperty('cancelRequested')
    expect(c).not.toHaveProperty('contextItems')
    expect(c.waitingApproval).toMatch(/本机侧车/)
    expect(c.approvalApproved).toMatch(/本机侧车/)
    expect(c.approvalApproved).not.toMatch(/Fake/)
    expect(c.approvalRejected).not.toMatch(/Fake/)
    for (const key of [
      'retryAccepted',
      'queueAccepted',
      'steerAccepted',
      'reconcileAccepted',
    ] as const) {
      expect(c[key]).not.toMatch(/Fake/i)
      expect(c[key]).toMatch(/本机|VoltAgent/)
    }
  })

  it('keeps the compatibility accessor on the same readonly copy', () => {
    expect(runtimeHonestyCopy()).toBe(VOLTAGENT_RUNTIME_HONESTY_COPY)
  })

  it('previewText truncates with ellipsis', () => {
    expect(previewText('短')).toBe('短')
    expect(previewText('a'.repeat(50))).toBe(`${'a'.repeat(40)}…`)
  })
})
