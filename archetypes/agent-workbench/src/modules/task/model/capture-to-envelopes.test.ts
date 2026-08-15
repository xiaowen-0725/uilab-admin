import { describe, expect, it } from 'vitest'
import { getEventStreamCapture } from '@/config/captures'
import { projectCapture } from '../projection/project-capture'
import { captureToEnvelopes } from './capture-to-envelopes'

describe('captureToEnvelopes', () => {
  const capture = getEventStreamCapture('case-fixture-workflow-replay')

  it('maps the workflow capture to envelopes the shared projection can fold', () => {
    const envelopes = captureToEnvelopes(capture)
    expect(envelopes.map((event) => event.eventType)).toContain('message.delta')
    expect(envelopes.map((event) => event.eventType)).toContain('turn.started')
    expect(envelopes.map((event) => event.eventType)).toContain('tool.started')
    expect(envelopes.map((event) => event.eventType)).toContain('file.changed')
    expect(envelopes.map((event) => event.eventType)).toContain('turn.completed')

    const file = envelopes.find((event) => event.eventType === 'file.changed')
    expect(file?.payload).toMatchObject({
      path: 'fixture/notes/workflow-result.md',
      changeKind: 'created',
      additions: 10,
    })
  })

  it('projects capture replay onto the same read model Timeline uses', () => {
    const readModel = projectCapture(capture)
    expect(readModel.turnStatus).toBe('completed')
    expect(readModel.timeline.some((item) => item.category === 'user-message')).toBe(
      true,
    )
    expect(
      readModel.timeline.some((item) => item.category === 'assistant-message'),
    ).toBe(true)
    expect(readModel.deliverables).toEqual([
      expect.objectContaining({
        path: 'fixture/notes/workflow-result.md',
        changeKind: 'created',
        source: 'file',
      }),
    ])
  })

  it('keeps progressive prefixes monotonic', () => {
    const early = projectCapture(capture, { untilTs: 100 })
    const mid = projectCapture(capture, { untilTs: 4000 })
    const full = projectCapture(capture)
    expect(early.turnStatus).not.toBe('completed')
    expect(mid.timeline.filter((item) => item.category === 'tool-group').length).toBeGreaterThan(
      0,
    )
    expect(full.timeline.length).toBeGreaterThan(mid.timeline.length)
    expect(full.deliverables.length).toBeGreaterThan(0)
  })
})
