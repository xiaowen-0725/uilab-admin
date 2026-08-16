import { afterEach, describe, expect, it } from 'vitest'
import { deleteWorkbenchIdb, openWorkbenchIdb } from '@/app/persistence/workbench-idb'
import {
  BOARD_WIDGET_LIMIT,
  BoardWidgetLimitError,
  addWidgetToBoard,
  createIdbBoardStore,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetRecord,
} from '@/modules/board'

const NOW = '2026-08-16T00:00:00.000Z'

function uniqueDbName(): string {
  return `test-board-commands-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function board(): BoardRecord {
  return {
    id: 'board-1',
    title: '上限板',
    isExample: false,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function widget(index: number): BoardWidgetRecord {
  return {
    id: `widget-${index}`,
    title: `小组件 ${index}`,
    html: '<html></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function placement(index: number): BoardPlacement {
  return {
    mountId: `mount-${index}`,
    widgetId: `widget-${index}`,
    x: (index % 3) * 4,
    y: Math.floor(index / 3) * 4,
    w: 4,
    h: 4,
  }
}

describe('addWidgetToBoard', () => {
  const opened: string[] = []

  afterEach(async () => {
    for (const name of opened.splice(0)) {
      await deleteWorkbenchIdb(name)
    }
  })

  it('rejects the 21st widget on a Board', async () => {
    const name = uniqueDbName()
    opened.push(name)
    const db = await openWorkbenchIdb({ name })
    const store = createIdbBoardStore(db)
    await store.putBoard(board())

    for (let i = 1; i <= BOARD_WIDGET_LIMIT; i += 1) {
      await addWidgetToBoard(store, {
        boardId: 'board-1',
        widget: widget(i),
        placement: placement(i),
      })
    }

    await expect(
      addWidgetToBoard(store, {
        boardId: 'board-1',
        widget: widget(21),
        placement: placement(21),
      }),
    ).rejects.toBeInstanceOf(BoardWidgetLimitError)

    const saved = await store.getBoard('board-1')
    expect(saved?.placements).toHaveLength(20)
    expect(await store.getWidget('widget-21')).toBeNull()
    db.close()
  })
})
