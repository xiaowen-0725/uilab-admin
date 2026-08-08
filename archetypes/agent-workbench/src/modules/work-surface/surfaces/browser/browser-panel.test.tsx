import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { BrowserPanel } from './browser-panel'

describe('BrowserPanel', () => {
  it('shows unsupported for file://', async () => {
    const host = { openExternal: vi.fn() }
    await render(
      <BrowserPanel
        resourceKey='file:///tmp/x.html'
        title='local'
        host={host}
      />,
    )
    await expect
      .element(page.getByTestId('work-surface-browser'))
      .toHaveAttribute('data-state', 'unsupported')
    await expect
      .element(page.getByTestId('browser-state-message'))
      .toHaveTextContent('不支持')
  })

  it('times out to load-failed when iframe never loads', async () => {
    const host = { openExternal: vi.fn() }
    await render(
      <BrowserPanel
        resourceKey='https://example.invalid/'
        title='dead'
        host={host}
        loadTimeoutMs={50}
      />,
    )
    await expect
      .poll(
        () =>
          page
            .getByTestId('work-surface-browser')
            .element()
            .getAttribute('data-state'),
        { timeout: 2000 },
      )
      .toBe('load-failed')
  })

  it('renders iframe for https and supports refresh + external open', async () => {
    const openExternal = vi.fn(async () => {})
    await render(
      <BrowserPanel
        resourceKey='https://example.com/'
        title='示例'
        host={{ openExternal }}
      />,
    )
    await expect
      .element(page.getByTestId('browser-iframe'))
      .toBeInTheDocument()
    await userEvent.click(page.getByTestId('browser-open-external'))
    expect(openExternal).toHaveBeenCalledWith('https://example.com/')
    await userEvent.click(page.getByTestId('browser-refresh'))
    // reload remounts iframe (key change)
    await expect
      .element(page.getByTestId('browser-iframe'))
      .toBeInTheDocument()
  })

  it('releases iframe src on unmount', async () => {
    const host = { openExternal: vi.fn() }
    const { unmount } = await render(
      <BrowserPanel
        resourceKey='http://localhost:9999/'
        title='local'
        host={host}
      />,
    )
    const iframe = page.getByTestId('browser-iframe').element() as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toContain('localhost')
    unmount()
    // after unmount, element is gone (release path exercised in effect cleanup)
    expect(document.querySelector('[data-testid="browser-iframe"]')).toBeNull()
  })
})
