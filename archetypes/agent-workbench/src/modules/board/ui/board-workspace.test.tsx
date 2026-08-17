import { useMemo, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  createControllableBoardJobRuntime,
  createUnavailableBoardJobRuntime,
} from '../adapters/memory-board-job-runtime'
import { createMemoryBoardStore } from '../adapters/memory-board-store'
import { createBoardRefreshController } from '../application/board-refresh'
import { DRAG_HANDLE_ATTR } from '../model/drag-handle'
import type { BoardJobRuntimePort } from '../ports/board-job-runtime-port'
import type { BoardStorePort } from '../ports/board-store-port'
import { BoardWorkspace } from './board-workspace'

const NOW = '2026-08-17T06:00:00.000Z'
const WIDGET_HTML =
  '<!doctype html><html><body><script>widget.ready()</script></body></html>'

async function seedBoard(store: BoardStorePort) {
  await store.putBoard({
    id: 'board-1',
    title: '刷新板',
    isExample: false,
    placements: [{ mountId: 'm1', widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
    createdAt: NOW,
    updatedAt: NOW,
  })
  await store.putWidget({
    id: 'w1',
    title: '汇率',
    html: WIDGET_HTML,
    span: { min: { w: 2, h: 2 }, default: { w: 4, h: 4 }, max: { w: 8, h: 8 } },
    latestData: { quote: 1 },
    latestDataAt: new Date().toISOString(),
    status: 'idle',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await store.putJob({
    id: 'j1',
    widgetId: 'w1',
    title: '拉汇率',
    description: '',
    enabled: true,
    trigger: { kind: 'manual' },
    approved: {
      code: 'export function run() { return {} }',
      codeHash: 'hash-j1',
      allowedHosts: ['example.com'],
      approvedAt: NOW,
      approvedInTaskId: 'task-1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  })
}

function WorkspaceHarness({
  store,
  jobRuntime,
  startOnDetail = true,
  width = 960,
}: {
  store: BoardStorePort
  jobRuntime: BoardJobRuntimePort
  startOnDetail?: boolean
  width?: number
}) {
  const [boardId, setBoardId] = useState<string | undefined>(
    startOnDetail ? 'board-1' : undefined,
  )
  const [revision, setRevision] = useState(0)
  const refresh = useMemo(
    () =>
      createBoardRefreshController({
        store,
        runtime: jobRuntime,
        onChange: () => setRevision((value) => value + 1),
      }),
    [jobRuntime, store],
  )
  return (
    <div style={{ width, height: 800 }}>
      <BoardWorkspace
        store={store}
        boardId={boardId}
        theme='light'
        refresh={refresh}
        revision={revision}
        taskExists={() => true}
        onOpenList={() => setBoardId(undefined)}
        onOpenBoard={(id) => setBoardId(id)}
        onCreateByChat={() => {}}
      />
    </div>
  )
}

function host() {
  return page.getByTestId('board-widget-host').element()
}

describe('BoardWorkspace refresh', () => {
  it('shows running from widget.status then updates data without remounting the frame', async () => {
    const store = createMemoryBoardStore()
    await seedBoard(store)
    const runtime = createControllableBoardJobRuntime()
    await render(<WorkspaceHarness store={store} jobRuntime={runtime} />)

    await expect.element(page.getByTestId('board-widget-refresh')).toBeInTheDocument()
    const frame = page.getByTestId('board-widget-frame').element()

    await userEvent.click(page.getByTestId('board-widget-refresh'))
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('running')

    runtime.complete('j1', { ok: true, payload: { quote: 42 } })
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('idle')
    expect(host().getAttribute('data-has-latest')).toBe('true')
    expect(page.getByTestId('board-widget-frame').element()).toBe(frame)
    expect(await store.getWidget('w1')).toMatchObject({ latestData: { quote: 42 } })
  })

  it('does not start a second run while running', async () => {
    const store = createMemoryBoardStore()
    await seedBoard(store)
    const runtime = createControllableBoardJobRuntime()
    await render(<WorkspaceHarness store={store} jobRuntime={runtime} />)

    await userEvent.click(page.getByTestId('board-widget-refresh'))
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('running')

    await expect.element(page.getByTestId('board-widget-refresh')).toBeDisabled()
    expect(runtime.calls).toEqual(['j1'])

    runtime.complete('j1', { ok: true, payload: { quote: 2 } })
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('idle')
  })

  it('keeps last data and shows the error on chrome when a run fails', async () => {
    const store = createMemoryBoardStore()
    await seedBoard(store)
    const runtime = createControllableBoardJobRuntime()
    await render(<WorkspaceHarness store={store} jobRuntime={runtime} />)

    await userEvent.click(page.getByTestId('board-widget-refresh'))
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('running')
    runtime.complete('j1', {
      ok: false,
      error: 'runtime_unavailable',
      hint: 'boom',
    })

    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('error')
    expect(host().getAttribute('data-has-latest')).toBe('true')
    await expect
      .element(page.getByTestId('board-widget-run-error'))
      .toHaveAttribute('title', 'boom')
    expect(await store.getWidget('w1')).toMatchObject({ latestData: { quote: 1 } })
  })

  it('keeps the running chrome after leaving the detail page and coming back', async () => {
    const store = createMemoryBoardStore()
    await seedBoard(store)
    const runtime = createControllableBoardJobRuntime()
    await render(<WorkspaceHarness store={store} jobRuntime={runtime} />)

    await userEvent.click(page.getByTestId('board-widget-refresh'))
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('running')

    await userEvent.click(page.getByTestId('board-breadcrumb-root'))
    await expect.element(page.getByTestId('board-list-page')).toBeInTheDocument()
    const seeded = page
      .getByTestId('board-card')
      .elements()
      .find((node) => node.getAttribute('data-board-id') === 'board-1')
    expect(seeded).toBeTruthy()
    await userEvent.click(seeded as HTMLElement)

    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('running')

    runtime.complete('j1', { ok: true, payload: { quote: 7 } })
    await expect
      .poll(() => host().getAttribute('data-widget-status'))
      .toBe('idle')
    expect(await store.getWidget('w1')).toMatchObject({ latestData: { quote: 7 } })
  })

  it('says 运行时未连接 when the sidecar is down and keeps refresh clickable', async () => {
    const store = createMemoryBoardStore()
    await seedBoard(store)
    await render(
      <WorkspaceHarness
        store={store}
        jobRuntime={createUnavailableBoardJobRuntime()}
      />,
    )

    await expect
      .element(page.getByTestId('board-widget-runtime-missing'))
      .toBeInTheDocument()
    const button = page.getByTestId('board-widget-refresh')
    await expect.element(button).toBeEnabled()
    await userEvent.click(button)
    await expect
      .element(page.getByTestId('board-refresh-hint'))
      .toHaveTextContent('运行时未连接')
    await expect.element(button).toBeEnabled()
    expect(await store.getWidget('w1')).toMatchObject({
      latestData: { quote: 1 },
      status: 'idle',
    })
  })
})

describe('BoardWorkspace example boards', () => {
  it('installs two example boards on a fresh list without CSP violations', async () => {
    const store = createMemoryBoardStore()
    const violations: string[] = []
    const onViolation = (event: Event) => {
      const policy = event as SecurityPolicyViolationEvent
      violations.push(`${policy.violatedDirective}:${policy.blockedURI}`)
    }
    window.addEventListener('securitypolicyviolation', onViolation)

    try {
      await render(
        <WorkspaceHarness
          store={store}
          jobRuntime={createUnavailableBoardJobRuntime()}
          startOnDetail={false}
        />,
      )

      await expect.poll(() => page.getByTestId('board-card').elements().length).toBe(2)
      expect(page.getByTestId('board-example-badge').elements()).toHaveLength(2)
      expect(page.getByTestId('board-list-empty').elements()).toHaveLength(0)
      expect(page.getByTestId('board-thumbnail-scale').elements().length).toBeGreaterThan(0)

      await expect
        .poll(
          () =>
            page
              .getByTestId('board-widget-host')
              .elements()
              .filter((node) => node.getAttribute('data-phase') === 'ready').length,
          { timeout: 8000 },
        )
        .toBeGreaterThan(0)
      expect(violations).toEqual([])
    } finally {
      window.removeEventListener('securitypolicyviolation', onViolation)
    }
  })

  it('deletes an example board and does not recreate it on the next list visit', async () => {
    const store = createMemoryBoardStore()
    await render(
      <WorkspaceHarness
        store={store}
        jobRuntime={createUnavailableBoardJobRuntime()}
        startOnDetail={false}
      />,
    )

    await expect.poll(() => page.getByTestId('board-card').elements().length).toBe(2)
    const guide = page
      .getByTestId('board-card')
      .elements()
      .find((node) => node.getAttribute('data-board-id') === 'example:getting-started')
    await userEvent.click(guide as HTMLElement)
    await expect.element(page.getByTestId('board-detail-page')).toBeInTheDocument()
    await userEvent.click(page.getByTestId('board-delete'))

    await expect.element(page.getByTestId('board-list-page')).toBeInTheDocument()
    await expect.poll(() => page.getByTestId('board-card').elements().length).toBe(1)
    expect(await store.getBoard('example:getting-started')).toBeNull()
    expect(await store.getInstalledPresets()).toMatchObject({ 'getting-started': 1 })
  })

  it('lets the user drag an example board and persists the layout', async () => {
    const store = createMemoryBoardStore()
    await render(
      <WorkspaceHarness
        store={store}
        jobRuntime={createUnavailableBoardJobRuntime()}
        startOnDetail={false}
        width={1200}
      />,
    )

    await expect.poll(() => page.getByTestId('board-card').elements().length).toBe(2)
    const guide = page
      .getByTestId('board-card')
      .elements()
      .find((node) => node.getAttribute('data-board-id') === 'example:getting-started')
    expect(guide).toBeTruthy()
    await userEvent.click(guide as HTMLElement)

    await expect.element(page.getByTestId('board-detail-page')).toBeInTheDocument()
    await expect.poll(() => page.getByTestId('board-canvas-item').elements().length).toBe(5)
    const before = await store.getBoard('example:getting-started')
    const start = before?.placements.find(
      (item) => item.widgetId === 'example:getting-started:resize',
    )
    expect(start).toBeTruthy()

    expect(page.getByTestId('board-canvas').element()).toHaveAttribute(
      'data-mode',
      'edit',
    )
    const host = page
      .getByTestId('board-widget-host')
      .elements()
      .find((node) => node.getAttribute('data-widget-id') === 'example:getting-started:resize')
    const handle = host?.querySelector('[data-testid="board-widget-chrome"]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.hasAttribute(DRAG_HANDLE_ATTR)).toBe(true)

    const item = page
      .getByTestId('board-canvas-item')
      .elements()
      .find(
        (node) =>
          node.getAttribute('data-item-id') ===
          'mount:example:getting-started:resize',
      ) as HTMLElement
    expect(item).toBeTruthy()
    item.focus()
    await userEvent.keyboard('{ArrowDown}')

    await expect
      .poll(async () => {
        const board = await store.getBoard('example:getting-started')
        const moved = board?.placements.find(
          (item) => item.widgetId === 'example:getting-started:resize',
        )
        return Boolean(moved && (moved.x !== start?.x || moved.y !== start?.y))
      }, { timeout: 4000 })
      .toBe(true)
  })
})
