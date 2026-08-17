import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { BoardView } from '../model/board-view'
import type { BoardRecord, BoardWidgetRecord, WidgetDataJobRecord } from '../model/types'
import { BoardDetailPage } from './board-detail-page'

const NOW = '2026-08-16T00:00:00.000Z'

function widget(): BoardWidgetRecord {
  return {
    id: 'w1',
    title: '计数器',
    html: '<!doctype html><html><body></body></html>',
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 6, h: 6 } },
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function board(createdByTaskId?: string): BoardRecord {
  return {
    id: 'board-1',
    title: '工作台',
    isExample: false,
    placements: [
      { mountId: 'm1', widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    createdByTaskId,
  }
}

function view(createdByTaskId?: string, job?: WidgetDataJobRecord): BoardView {
  const jobs = new Map()
  if (job) jobs.set(job.widgetId, job)
  return {
    board: board(createdByTaskId),
    widgets: new Map([['w1', widget()]]),
    jobs,
    lastRunByJobId: new Map(),
  }
}

describe('BoardDetailPage', () => {
  it('hides the source-task link when the task is gone', async () => {
    await render(
      <BoardDetailPage
        view={view('task-gone')}
        theme='light'
        taskExists={() => false}
        onBack={() => {}}
        onLayoutChange={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-open-source-task').elements()).toHaveLength(0)
    expect(page.getByTestId('board-breadcrumb')).toHaveTextContent('看板')
    expect(page.getByTestId('board-breadcrumb')).toHaveTextContent('工作台')
  })

  it('shows the source-task link when the task still exists', async () => {
    const onOpenSourceTask = vi.fn()
    await render(
      <BoardDetailPage
        view={view('task-live')}
        theme='light'
        taskExists={(id) => id === 'task-live'}
        onBack={() => {}}
        onLayoutChange={() => {}}
        onCreateByChat={() => {}}
        onOpenSourceTask={onOpenSourceTask}
      />,
    )

    await userEvent.click(page.getByTestId('board-open-source-task'))
    expect(onOpenSourceTask).toHaveBeenCalledWith('task-live')
  })

  it('deletes the board from the detail chrome', async () => {
    const onDeleteBoard = vi.fn()
    await render(
      <BoardDetailPage
        view={view()}
        theme='light'
        taskExists={() => false}
        onBack={() => {}}
        onLayoutChange={() => {}}
        onCreateByChat={() => {}}
        onDeleteBoard={onDeleteBoard}
      />,
    )

    await userEvent.click(page.getByTestId('board-delete'))
    expect(onDeleteBoard).toHaveBeenCalledTimes(1)
  })

  it('labels example data widgets that have no job', async () => {
    const sample = widget()
    sample.latestData = { value: 3 }
    await render(
      <BoardDetailPage
        view={{
          board: { ...board(), isExample: true, title: '示例：每日速递' },
          widgets: new Map([['w1', sample]]),
          jobs: new Map(),
          lastRunByJobId: new Map(),
        }}
        theme='light'
        taskExists={() => false}
        onBack={() => {}}
        onLayoutChange={() => {}}
        onCreateByChat={() => {}}
      />,
    )

    expect(page.getByTestId('board-example-badge')).toHaveTextContent('示例')
    expect(page.getByTestId('board-widget-example-data')).toHaveTextContent(
      '示例数据 · 未绑定取数作业',
    )
    expect(page.getByTestId('board-widget-example-data')).toHaveTextContent(
      '想让它每天自动更新？在对话里说一声',
    )
  })

  it('opens the job dialog with authorized status and revoke', async () => {
    const onRevokeJob = vi.fn()
    const job: WidgetDataJobRecord = {
      id: 'job-1',
      widgetId: 'w1',
      title: '抓取汇率',
      description: '每天拉一次公开汇率',
      enabled: true,
      trigger: { kind: 'manual' },
      approved: {
        code: 'export function run() {}',
        codeHash: 'abc',
        allowedHosts: ['example.com'],
        approvedAt: NOW,
        approvedInTaskId: 'task-live',
      },
      createdAt: NOW,
      updatedAt: NOW,
    }
    await render(
      <BoardDetailPage
        view={view('task-live', job)}
        theme='light'
        taskExists={() => true}
        onBack={() => {}}
        onLayoutChange={() => {}}
        onCreateByChat={() => {}}
        onRevokeJob={onRevokeJob}
      />,
    )

    await userEvent.click(page.getByTestId('board-widget-more'))
    await userEvent.click(page.getByTestId('board-widget-menu-job'))
    await expect.element(page.getByTestId('board-job-dialog')).toBeInTheDocument()
    expect(page.getByTestId('board-job-auth-status')).toHaveTextContent('已授权运行')
    await userEvent.click(page.getByTestId('board-job-revoke'))
    expect(onRevokeJob).toHaveBeenCalledWith('job-1')
  })
})
