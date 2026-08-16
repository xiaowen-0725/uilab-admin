import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
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

  it(
    'marks a silent widget dead within about 15s and offers reload',
    { timeout: 20_000 },
    async () => {
      await render(
        <BoardWidgetHost
          widgetId='w-loop'
          title='无响应'
          html={probeHtml('widget.ready();')}
          data={{}}
          theme='light'
          heartbeat
        />,
      )

      await expectPhase('ready')
      // Headless Chromium keeps srcdoc in the host renderer, so `while (true)`
      // would freeze the suite. Replacing the document drops the port the same
      // way a blocked widget event loop stops pongs — the host still counts
      // three misses.
      const iframe = frame()
      iframe.removeAttribute('src')
      iframe.srcdoc = '<!doctype html><title>gone</title>'

      await expect
        .poll(() => hostElement().getAttribute('data-phase'), { timeout: 16_000 })
        .toBe('dead')
      await expect
        .element(page.getByTestId('board-widget-reload'))
        .toHaveTextContent('重新加载')
    },
  )
})
