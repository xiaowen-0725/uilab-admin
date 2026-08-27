import { describe, expect, it } from 'vitest'
import type { DeliverableRef } from '../../projection/types'
import {
  classifyDeliverable,
  deliverableCompletionKey,
  featuredDeliverable,
  isNonTerminalTurnStatus,
  lastCompletedTurnId,
  pathMatchesDeliverable,
  shouldAutoOpenDeliverablePane,
  shouldRequestPaneOpenMotion,
  shouldShowAllArtifactsLink,
} from './deliverable-presentation'

function item(
  path: string,
  changeKind: DeliverableRef['changeKind'] = 'created',
): DeliverableRef {
  return { path, source: 'file', changeKind }
}

describe('deliverable presentation', () => {
  it('classifies preview vs source vs unsupported', () => {
    expect(classifyDeliverable('poems.md')).toBe('preview')
    expect(classifyDeliverable('out/index.html')).toBe('preview')
    expect(classifyDeliverable('scan.pdf')).toBe('preview')
    expect(classifyDeliverable('src/app.ts')).toBe('source')
    expect(classifyDeliverable('legacy.doc')).toBe('unsupported')
  })

  it('picks the last preview file as the featured card, skipping source and deleted', () => {
    const featured = featuredDeliverable([
      item('notes/a.md'),
      item('src/app.ts'),
      item('notes/b.md', 'deleted'),
      item('chart.png'),
    ])
    expect(featured?.path).toBe('chart.png')
    expect(featuredDeliverable([item('src/a.ts'), item('src/b.ts')])).toBeNull()
  })

  it('shows the all-artifacts link when there is no featured card or N > 1', () => {
    const onlyTs = [item('a.ts')]
    expect(shouldShowAllArtifactsLink(onlyTs, featuredDeliverable(onlyTs))).toBe(
      true,
    )
    const oneMd = [item('a.md')]
    expect(shouldShowAllArtifactsLink(oneMd, featuredDeliverable(oneMd))).toBe(
      false,
    )
    const mixed = [item('a.md'), item('b.ts')]
    expect(shouldShowAllArtifactsLink(mixed, featuredDeliverable(mixed))).toBe(
      true,
    )
  })

  it('matches deliverable paths by basename and suffix', () => {
    const paths = ['notes/poems.md']
    expect(pathMatchesDeliverable('notes/poems.md', paths)).toBe(true)
    expect(pathMatchesDeliverable('poems.md', paths)).toBe(true)
    expect(pathMatchesDeliverable('src/foo.ts', paths)).toBe(false)
  })

  it('auto-opens only after this session saw the turn run, and not after dismiss', () => {
    expect(
      shouldAutoOpenDeliverablePane({
        completionKey: deliverableCompletionKey('t1', 'turn-1'),
        featuredPath: 'poems.md',
        observedActive: true,
        alreadyOpened: false,
        dismissed: false,
      }),
    ).toBe(true)
    expect(
      shouldAutoOpenDeliverablePane({
        completionKey: 't1:turn-1',
        featuredPath: 'poems.md',
        observedActive: false,
        alreadyOpened: false,
        dismissed: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoOpenDeliverablePane({
        completionKey: 't1:turn-1',
        featuredPath: 'poems.md',
        observedActive: true,
        alreadyOpened: false,
        dismissed: true,
      }),
    ).toBe(false)
  })

  it('requests drawer motion only when the pane is currently closed', () => {
    expect(shouldRequestPaneOpenMotion(true, false)).toBe(true)
    expect(shouldRequestPaneOpenMotion(true, true)).toBe(false)
    expect(shouldRequestPaneOpenMotion(false, false)).toBe(false)
  })

  it('treats in-flight turn statuses as non-terminal', () => {
    expect(isNonTerminalTurnStatus(null)).toBe(false)
    expect(isNonTerminalTurnStatus('completed')).toBe(false)
    expect(isNonTerminalTurnStatus('failed')).toBe(false)
    expect(isNonTerminalTurnStatus('cancelled')).toBe(false)
    expect(isNonTerminalTurnStatus('interrupted')).toBe(false)
    expect(isNonTerminalTurnStatus('queued')).toBe(true)
    expect(isNonTerminalTurnStatus('running')).toBe(true)
    expect(isNonTerminalTurnStatus('waiting_for_approval')).toBe(true)
    expect(isNonTerminalTurnStatus('waiting_for_input')).toBe(true)
    expect(isNonTerminalTurnStatus('cancelling')).toBe(true)
  })

  it('reads the last completed turn id from the terminal row', () => {
    expect(
      lastCompletedTurnId({
        turnStatus: 'completed',
        activeTurnId: 'turn-2',
        timeline: [
          { category: 'turn-terminal', status: 'completed', turnId: 'turn-1' },
          { category: 'user-message', turnId: 'turn-2' },
          { category: 'turn-terminal', status: 'completed', turnId: 'turn-2' },
        ],
      }),
    ).toBe('turn-2')
  })
})
