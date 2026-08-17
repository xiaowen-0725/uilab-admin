import { describe, expect, it } from 'vitest'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import type { BoardRecord, BoardWidgetRecord } from '../model/types'
import {
  BOARD_FEATURE_ID,
  grantBoardCapability,
  resolveCapabilityFeatureIds,
} from './board-capability'

const NOW = '2026-08-17T10:00:00.000Z'

function board(overrides: Partial<BoardRecord> = {}): BoardRecord {
  return {
    id: 'board-1',
    title: '板',
    isExample: false,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function widget(overrides: Partial<BoardWidgetRecord> = {}): BoardWidgetRecord {
  return {
    id: 'w-1',
    title: '组件',
    html: '<html></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('resolveCapabilityFeatureIds', () => {
  it('stays empty until the Task is granted or has committed a Board', async () => {
    const store = createMemoryBoardStore()
    expect(await resolveCapabilityFeatureIds(store, 'task-1')).toEqual([])
  })

  it('returns board after 对话创建 grants the Task', async () => {
    const store = createMemoryBoardStore()
    await grantBoardCapability(store, 'task-1')
    expect(await resolveCapabilityFeatureIds(store, 'task-1')).toEqual([
      BOARD_FEATURE_ID,
    ])
    expect(await resolveCapabilityFeatureIds(store, 'task-other')).toEqual([])
  })

  it('returns board when a committed Board remembers the Task', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(board({ createdByTaskId: 'task-2' }))
    expect(await resolveCapabilityFeatureIds(store, 'task-2')).toEqual([
      BOARD_FEATURE_ID,
    ])
  })

  it('returns board when a committed widget remembers the Task', async () => {
    const store = createMemoryBoardStore()
    await store.putBoard(
      board({
        placements: [
          { mountId: 'm-1', widgetId: 'w-1', x: 0, y: 0, w: 4, h: 4 },
        ],
      }),
    )
    await store.putWidget(widget({ createdByTaskId: 'task-3' }))
    expect(await resolveCapabilityFeatureIds(store, 'task-3')).toEqual([
      BOARD_FEATURE_ID,
    ])
  })
})
