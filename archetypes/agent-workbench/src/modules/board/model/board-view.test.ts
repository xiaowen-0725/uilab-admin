import { describe, expect, it } from 'vitest'
import {
  boardHasRefreshableSource,
  widgetCanRefresh,
  type BoardView,
} from './board-view'
import type {
  WidgetDataJobRecord,
  WidgetDataSourceRecord,
} from './types'

const NOW = '2026-08-22T00:00:00.000Z'

function view(overrides: Partial<BoardView> = {}): BoardView {
  return {
    board: {
      id: 'board-1',
      title: '板',
      isExample: false,
      placements: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    widgets: new Map(),
    jobs: new Map(),
    sources: new Map(),
    lastRunByJobId: new Map(),
    ...overrides,
  }
}

function job(widgetId: string): WidgetDataJobRecord {
  return {
    id: `job:${widgetId}`,
    widgetId,
    title: '作业',
    description: '',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function source(
  widgetId: string,
  kind: WidgetDataSourceRecord['kind'],
): WidgetDataSourceRecord {
  return {
    id: `source:${widgetId}`,
    widgetId,
    kind,
    trigger: { kind: 'manual' },
    referencableByJob: kind === 'query',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('widgetCanRefresh', () => {
  it('allows a widget that has a job row', () => {
    const next = view({ jobs: new Map([['w1', job('w1')]]) })
    expect(widgetCanRefresh(next, 'w1')).toBe(true)
    expect(widgetCanRefresh(next, 'w-missing')).toBe(false)
  })

  it('allows a widget whose source is query, not preset or job-kind', () => {
    const next = view({
      sources: new Map([
        ['w-query', source('w-query', 'query')],
        ['w-preset', source('w-preset', 'preset')],
        ['w-job-source', source('w-job-source', 'job')],
      ]),
    })
    expect(widgetCanRefresh(next, 'w-query')).toBe(true)
    expect(widgetCanRefresh(next, 'w-preset')).toBe(false)
    expect(widgetCanRefresh(next, 'w-job-source')).toBe(false)
  })
})

describe('boardHasRefreshableSource', () => {
  it('is false for an empty board and for preset-only sources', () => {
    expect(boardHasRefreshableSource(view())).toBe(false)
    expect(
      boardHasRefreshableSource(
        view({ sources: new Map([['w1', source('w1', 'preset')]]) }),
      ),
    ).toBe(false)
  })

  it('is true when any job row exists, even without a widget', () => {
    expect(
      boardHasRefreshableSource(view({ jobs: new Map([['orphan', job('orphan')]]) })),
    ).toBe(true)
  })

  it('is true when any source is query', () => {
    expect(
      boardHasRefreshableSource(
        view({ sources: new Map([['w1', source('w1', 'query')]]) }),
      ),
    ).toBe(true)
  })
})
