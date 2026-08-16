import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { PROTOTYPE_WIDGETS } from '../../fixtures/prototype-boards'
import type { BoardWidget } from '../../model/board'
import { BoardWidgetHost } from './board-widget-host'

function hostElement() {
  return page.getByTestId('board-widget-host').element()
}

/**
 * Widgets are opaque-origin, so a test cannot read their DOM. These probes
 * report what they saw back over the bridge instead — the same channel a real
 * widget uses, which keeps the test honest about what the host can observe.
 */
function probeWidget(script: string): BoardWidget {
  return {
    id: 'w-probe',
    title: '探针',
    placement: { x: 0, y: 0, w: 4, h: 4 },
    data: { marker: 'first' },
    dataState: 'ready',
    job: null,
    source: { css: '', script },
  }
}

function frame() {
  return page.getByTestId('board-widget-frame').element() as HTMLIFrameElement
}

async function expectPhase(phase: string, timeout = 4000) {
  await expect
    .poll(() => hostElement().getAttribute('data-phase'), { timeout })
    .toBe(phase)
}

describe('BoardWidgetHost', () => {
  it('never grants a sandbox token that would void isolation', async () => {
    await render(
      <BoardWidgetHost widget={PROTOTYPE_WIDGETS.POMODORO} theme='light' />,
    )
    const sandbox = frame().getAttribute('sandbox') ?? ''

    expect(sandbox.split(/\s+/).filter(Boolean)).toEqual(['allow-scripts'])
    // allow-scripts + allow-same-origin lets the child delete its own sandbox.
    expect(sandbox).not.toContain('allow-same-origin')
    expect(frame().getAttribute('csp')).toContain("connect-src 'none'")
    expect(frame().getAttribute('src')).toBeNull()
    // Opaque origin, so the host cannot reach into the widget either.
    expect(frame().contentDocument).toBeNull()
  })

  it('reaches ready over the bridge and reports content height', async () => {
    const onReady = vi.fn()
    await render(
      <BoardWidgetHost
        widget={PROTOTYPE_WIDGETS.CHECKLIST}
        theme='light'
        onReady={onReady}
      />,
    )
    await expectPhase('ready')
    expect(onReady).toHaveBeenCalledTimes(1)
    const [widgetId, elapsed] = onReady.mock.calls[0] as [string, number]
    expect(widgetId).toBe('w-checklist')
    expect(elapsed).toBeGreaterThan(0)
  })

  it('runs widget code only after the handshake, so first data is never missed', async () => {
    const onSubmit = vi.fn()
    await render(
      <BoardWidgetHost
        widget={probeWidget('widget.submit({ sawOnStartup: widget.data });')}
        theme='light'
        onSubmit={onSubmit}
      />,
    )
    await expectPhase('ready')

    // Synchronous startup code already sees the initial payload.
    expect(onSubmit).toHaveBeenCalledWith('w-probe', {
      sawOnStartup: { marker: 'first' },
    })
  })

  it('pushes later data to a live widget without reloading it', async () => {
    const onSubmit = vi.fn()
    const widget = probeWidget(
      'widget.onData(function (data) { widget.submit({ seen: data }); });',
    )
    const screen = await render(
      <BoardWidgetHost widget={widget} theme='light' onSubmit={onSubmit} />,
    )
    await expectPhase('ready')
    const before = frame()
    expect(onSubmit).toHaveBeenCalledWith('w-probe', {
      seen: { marker: 'first' },
    })

    const updated: BoardWidget = { ...widget, data: { marker: 'second' } }
    await screen.rerender(
      <BoardWidgetHost widget={updated} theme='light' onSubmit={onSubmit} />,
    )

    await expect
      .poll(() => onSubmit.mock.calls.length, { timeout: 4000 })
      .toBeGreaterThan(1)
    expect(onSubmit).toHaveBeenLastCalledWith('w-probe', {
      seen: { marker: 'second' },
    })
    // Same frame instance: new data does not cost a document reload.
    expect(frame()).toBe(before)
  })

  it('surfaces a widget error in the chrome and keeps the board usable', async () => {
    await render(
      <BoardWidgetHost widget={PROTOTYPE_WIDGETS.BROKEN} theme='light' />,
    )
    await expectPhase('failed')
    await expect
      .element(page.getByTestId('board-widget-error'))
      .toHaveTextContent('取数作业还没跑过')
    // The frame stays mounted so previously rendered content is still visible.
    expect(frame()).toBeInTheDocument()
  })

  it('reloads with a fresh nonce when the widget has no data job', async () => {
    await render(
      <BoardWidgetHost widget={PROTOTYPE_WIDGETS.POMODORO} theme='light' />,
    )
    await expectPhase('ready')
    const firstCsp = frame().getAttribute('csp')

    await userEvent.click(page.getByTestId('board-widget-refresh'))
    await expectPhase('ready')

    expect(frame().getAttribute('csp')).not.toBe(firstCsp)
  })

  it('delegates refresh to the data job instead of reloading, when there is one', async () => {
    const onRefresh = vi.fn()
    await render(
      <BoardWidgetHost
        widget={PROTOTYPE_WIDGETS.NEWS}
        theme='light'
        onRefresh={onRefresh}
      />,
    )
    await expectPhase('ready')
    const before = frame()

    await userEvent.click(page.getByTestId('board-widget-refresh'))

    expect(onRefresh).toHaveBeenCalledWith('w-news')
    expect(frame()).toBe(before)
  })

  it('drops chrome and the drag handle for thumbnails', async () => {
    await render(
      <BoardWidgetHost
        widget={PROTOTYPE_WIDGETS.TREND}
        theme='light'
        chrome='none'
        inert
      />,
    )
    await expectPhase('ready')

    expect(page.getByTestId('board-widget-chrome').elements()).toHaveLength(0)
    expect(hostElement().querySelector('[data-board-drag-handle]')).toBeNull()
  })

  it('marks the header as a drag handle only when movable', async () => {
    const screen = await render(
      <BoardWidgetHost widget={PROTOTYPE_WIDGETS.GUIDE} theme='light' />,
    )
    expect(
      page.getByTestId('board-widget-chrome').element().hasAttribute('data-board-drag-handle'),
    ).toBe(false)

    await screen.rerender(
      <BoardWidgetHost widget={PROTOTYPE_WIDGETS.GUIDE} theme='light' movable />,
    )
    expect(
      page.getByTestId('board-widget-chrome').element().hasAttribute('data-board-drag-handle'),
    ).toBe(true)
  })
})
