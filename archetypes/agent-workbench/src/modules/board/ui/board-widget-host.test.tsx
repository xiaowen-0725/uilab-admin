import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { DAILY_BRIEF_STAT_HTML } from '../fixtures/widget-html'
import { WIDGET_THEME_VARS } from '../model/widget-document'
import { BoardWidgetHost } from './board-widget-host'

function hostElement() {
  return page.getByTestId('board-widget-host').element()
}

function frame() {
  return page.getByTestId('board-widget-frame').element() as HTMLIFrameElement
}

function probeHtml(script: string): string {
  return `<!doctype html><html><head></head><body><script>${script}</script></body></html>`
}

async function expectPhase(phase: string, timeout = 4000) {
  await expect
    .poll(() => hostElement().getAttribute('data-phase'), { timeout })
    .toBe(phase)
}

describe('BoardWidgetHost', () => {
  it('keeps an opaque origin and round-trips data over the bridge', async () => {
    const onSubmit = vi.fn()
    await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={probeHtml(
          'widget.onDataChange(function (data) { widget.submit({ seen: data }); }); widget.ready();',
        )}
        data={{ marker: 'first' }}
        theme='light'
        canSubmit
        onSubmit={onSubmit}
      />,
    )

    expect(frame().contentDocument).toBeNull()
    await expectPhase('ready')
    expect(onSubmit).toHaveBeenCalledWith({ seen: { marker: 'first' } })
  })

  it('paints prefilled example data after a StrictMode remount', async () => {
    const onSubmit = vi.fn()
    await render(
      <StrictMode>
        <BoardWidgetHost
          widgetId='example:daily-brief:stat'
          title='未读消息'
          html={probeHtml(
            'widget.onDataChange(function (data) { widget.submit({ painted: data }); }); widget.ready();',
          )}
          data={{ value: 128, label: '未读消息', delta: 12 }}
          theme='dark'
          canSubmit
          onSubmit={onSubmit}
        />
      </StrictMode>,
    )

    await expectPhase('ready')
    expect(onSubmit).toHaveBeenCalledWith({
      painted: { value: 128, label: '未读消息', delta: 12 },
    })
    expect(hostElement().getAttribute('data-has-latest')).toBe('true')
    expect(page.getByTestId('board-widget-error').elements()).toHaveLength(0)
  })

  it('still paints prefilled data after the user reloads the widget', async () => {
    const onSubmit = vi.fn()
    const html = probeHtml(
      'widget.onDataChange(function (data) { widget.submit({ painted: data }); }); widget.ready();',
    )
    await render(
      <BoardWidgetHost
        widgetId='w-reassign'
        title='重装'
        html={html}
        data={{ value: 128 }}
        theme='dark'
        canSubmit
        onSubmit={onSubmit}
      />,
    )
    await expectPhase('ready')
    onSubmit.mockClear()

    await userEvent.click(page.getByTestId('board-widget-more'))
    await userEvent.click(page.getByTestId('board-widget-menu-reload'))

    await expect
      .poll(() => onSubmit.mock.calls.at(-1)?.[0], { timeout: 4000 })
      .toEqual({ painted: { value: 128 } })
    await expectPhase('ready')
    expect(page.getByTestId('board-widget-error').elements()).toHaveLength(0)
  })

  it('runs the daily-brief stat fixture against prefilled latestData', async () => {
    const onReady = vi.fn()
    await render(
      <StrictMode>
        <BoardWidgetHost
          widgetId='example:daily-brief:stat'
          title='未读消息'
          html={DAILY_BRIEF_STAT_HTML}
          data={{ value: 128, label: '未读消息', delta: 12 }}
          theme='dark'
          onReady={onReady}
        />
      </StrictMode>,
    )

    await expectPhase('ready')
    expect(onReady).toHaveBeenCalled()
    expect(page.getByTestId('board-widget-error').elements()).toHaveLength(0)
  })

  it('lets startup code read a non-empty widget.data after init', async () => {
    const onSubmit = vi.fn()
    await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={probeHtml(
          'widget.submit({ sawOnStartup: widget.data, saved: widget.getInput("note") }); widget.saveInput("note", "hi"); widget.submit({ afterSave: widget.getInput("note") }); widget.ready();',
        )}
        data={{ marker: 'first' }}
        theme='light'
        canSubmit
        inputs={{ note: 'seed' }}
        onSubmit={onSubmit}
      />,
    )

    await expectPhase('ready')
    expect(onSubmit).toHaveBeenCalledWith({
      sawOnStartup: { marker: 'first' },
      saved: 'seed',
    })
    expect(onSubmit).toHaveBeenCalledWith({ afterSave: 'hi' })
  })

  it('shows 需重新登录 independently from a last-update-failed mark', async () => {
    await render(
      <BoardWidgetHost
        widgetId='w-masked'
        title='收入'
        html={probeHtml('widget.ready()')}
        theme='light'
        status='error'
        runError='上次更新失败'
        identityChrome='needs_relogin'
      />,
    )

    await expectPhase('ready')
    expect(hostElement().getAttribute('data-has-latest')).toBe('false')
    expect(hostElement().getAttribute('data-identity-chrome')).toBe(
      'needs_relogin',
    )
    await expect
      .element(page.getByTestId('board-widget-needs-relogin'))
      .toHaveAccessibleName('需重新登录')
    expect(page.getByTestId('board-widget-run-error').elements()).toHaveLength(0)
  })

  it('keeps a last-update-failed mark visible when data is still shown', async () => {
    await render(
      <BoardWidgetHost
        widgetId='w-stale'
        title='收入'
        html={probeHtml('widget.ready()')}
        data={{ quote: 1 }}
        theme='light'
        status='error'
        runError='上次更新失败'
      />,
    )

    await expectPhase('ready')
    expect(hostElement().getAttribute('data-has-latest')).toBe('true')
    await expect
      .element(page.getByTestId('board-widget-run-error'))
      .toHaveAccessibleName('上次更新失败')
    expect(page.getByTestId('board-widget-needs-relogin').elements()).toHaveLength(
      0,
    )
  })

  it('keeps the error chrome after a later ready', async () => {
    await render(
      <BoardWidgetHost
        widgetId='w-broken'
        title='坏掉的小组件'
        html={probeHtml(
          'setTimeout(function () { widget.ready(); }, 40); throw new Error("取数作业还没跑过");',
        )}
        data={{}}
        theme='light'
      />,
    )

    await expect
      .element(page.getByTestId('board-widget-error'))
      .toHaveTextContent('取数作业还没跑过')
    await expect
      .poll(() => hostElement().getAttribute('data-phase'), { timeout: 4000 })
      .toBe('failed')
    await expect
      .element(page.getByTestId('board-widget-error'))
      .toHaveTextContent('取数作业还没跑过')
  })

  it('rejects a 17th saveInput key and shows a hint', async () => {
    const onSaveInput = vi.fn()
    await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={probeHtml(
          'for (var i = 0; i < 17; i += 1) { widget.saveInput("k" + i, "v"); } widget.ready();',
        )}
        data={{}}
        theme='light'
        onSaveInput={onSaveInput}
      />,
    )

    await expectPhase('ready')
    await expect
      .element(page.getByTestId('board-widget-hint'))
      .toHaveTextContent('16')
    expect(onSaveInput).toHaveBeenCalledTimes(16)
  })

  it('rejects openLink javascript: URLs', async () => {
    const onOpenLink = vi.fn()
    await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={probeHtml(
          'widget.openLink("javascript:alert(1)"); widget.ready();',
        )}
        data={{}}
        theme='light'
        onOpenLink={onOpenLink}
      />,
    )

    await expectPhase('ready')
    expect(onOpenLink).not.toHaveBeenCalled()
    await expect
      .element(page.getByTestId('board-widget-hint'))
      .toHaveTextContent('http')
  })

  it('updates theme CSS variables inside the widget', async () => {
    const onSubmit = vi.fn()
    const html = probeHtml(
      'widget.onThemeChange(function (theme) { widget.submit({ theme: theme, bg: getComputedStyle(document.documentElement).getPropertyValue("--widget-bg").trim() }); }); widget.ready();',
    )
    const screen = await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={html}
        data={{}}
        theme='light'
        canSubmit
        onSubmit={onSubmit}
      />,
    )

    await expectPhase('ready')
    await screen.rerender(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={html}
        data={{}}
        theme='dark'
        canSubmit
        onSubmit={onSubmit}
      />,
    )

    await expect
      .poll(() => onSubmit.mock.calls.at(-1)?.[0], { timeout: 4000 })
      .toEqual({
        theme: 'dark',
        bg: WIDGET_THEME_VARS.dark['--widget-bg'],
      })
  })

  it('does not postMessage to the widget when refresh is clicked', async () => {
    const onRefresh = vi.fn()
    const onSubmit = vi.fn()
    await render(
      <BoardWidgetHost
        widgetId='w-probe'
        title='探针'
        html={probeHtml(
          'widget.onDataChange(function (data) { widget.submit({ seen: data }); }); widget.ready();',
        )}
        data={{ marker: 'first' }}
        theme='light'
        canSubmit
        onRefresh={onRefresh}
        onSubmit={onSubmit}
      />,
    )
    await expectPhase('ready')
    const callsBefore = onSubmit.mock.calls.length

    await userEvent.click(page.getByTestId('board-widget-refresh'))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(callsBefore)
  })

  it('paints the real 未读消息 fixture as 128', async () => {
    const onSubmit = vi.fn()
    await render(
      <StrictMode>
        <BoardWidgetHost
          widgetId='example:daily-brief:stat'
          title='未读消息'
          html={DAILY_BRIEF_STAT_HTML}
          data={{ value: 128, label: '未读消息', delta: 12 }}
          theme='dark'
          canSubmit
          onSubmit={onSubmit}
        />
      </StrictMode>,
    )

    await expectPhase('ready')
    expect(hostElement().getAttribute('data-latest-preview')).toBe('128')
    expect(onSubmit).toHaveBeenCalledWith({
      painted: { value: 128, label: '未读消息', delta: 12 },
    })
  })

  it('keeps a healthy widget ready across heartbeat beats', async () => {
    await render(
      <BoardWidgetHost
        widgetId='w-alive'
        title='心跳'
        html={probeHtml('widget.ready();')}
        data={{}}
        theme='light'
        heartbeat
        heartbeatMs={40}
        heartbeatMissLimit={3}
      />,
    )

    await expectPhase('ready')
    await new Promise((resolve) => window.setTimeout(resolve, 200))
    expect(hostElement().getAttribute('data-phase')).toBe('ready')
    expect(page.getByTestId('board-widget-error').elements()).toHaveLength(0)
  })

  it('marks a silent widget dead after missed heartbeats and offers reload', async () => {
    await render(
      <BoardWidgetHost
        widgetId='w-loop'
        title='无响应'
        html={probeHtml('widget.ready();')}
        data={{}}
        theme='light'
        heartbeat
        heartbeatMs={40}
        heartbeatMissLimit={3}
      />,
    )

    await expectPhase('ready')
    // Headless Chromium keeps srcdoc in the host renderer, so `while (true)`
    // would freeze the suite. Parking on about:blank drops the document
    // without a new handshake — the host still counts three missed pongs.
    const iframe = frame()
    iframe.removeAttribute('srcdoc')
    iframe.src = 'about:blank'

    await expect
      .poll(() => hostElement().getAttribute('data-phase'), { timeout: 2000 })
      .toBe('dead')
    await expect
      .element(page.getByTestId('board-widget-reload'))
      .toHaveTextContent('重新加载')
  })
})
