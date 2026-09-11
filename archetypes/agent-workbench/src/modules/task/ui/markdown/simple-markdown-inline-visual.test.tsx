/**
 * Closed ```visual fences become a sandboxed HTML card; html/svg stay code.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { SimpleMarkdown } from './simple-markdown'
import { workbenchMarkdownPlugins } from './workbench-markdown-plugins'
import { buildChildIframeCsp } from '@/lib/html-island/child-iframe-policy'
import { readHostCspNonce } from './inline-visual-view'
import { INLINE_VISUAL_SOURCE_MAX_BYTES } from '@/lib/inline-visual/build-inline-visual-document'

const COMPARISON = `<title>方案 A vs 方案 B</title>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <section style="background:#e8f1ff;border-radius:12px;padding:12px">
    <h2>方案 A</h2>
    <ul><li>本地先跑通</li></ul>
  </section>
  <section style="background:#fff4e5;border-radius:12px;padding:12px">
    <h2>方案 B</h2>
    <ul><li>先搭平台</li></ul>
  </section>
</div>`

function visualFence(body: string, language = 'visual'): string {
  return ['对照如下。', '', '```' + language, body, '```', '', '以上。'].join(
    '\n',
  )
}

async function renderMarkdown(
  source: string,
  isAnimating = false,
): Promise<Element> {
  await render(<SimpleMarkdown isAnimating={isAnimating} source={source} />)
  const root = page.getByTestId('simple-markdown')
  await expect.element(root).toBeInTheDocument()
  return root.element()
}

describe('SimpleMarkdown inline visuals', () => {
  it('draws a closed visual fence as a sandboxed island card', async () => {
    const nonce = readHostCspNonce()
    const root = await renderMarkdown(visualFence(COMPARISON))
    const card = page.getByTestId('inline-visual')
    await expect.element(card).toBeInTheDocument()
    await expect.element(card).toHaveTextContent('方案 A vs 方案 B')
    const iframe = page.getByTestId('inline-visual-frame').element()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe.getAttribute('csp')).toBe(buildChildIframeCsp(nonce))
    expect(iframe.getAttribute('csp')).toContain("connect-src 'none'")
    expect(root.textContent ?? '').not.toContain('```visual')
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
  })

  it('treats Visual info-string case as the same language', async () => {
    await renderMarkdown(visualFence(COMPARISON, 'Visual'))
    await expect.element(page.getByTestId('inline-visual')).toBeInTheDocument()
  })

  it('keeps an unclosed visual fence as a code block while streaming', async () => {
    const root = await renderMarkdown(
      ['流式中', '', '```visual', '<title>半截', '<div>还没结束'].join('\n'),
      true,
    )
    expect(root.querySelector('[data-testid="inline-visual"]')).toBeNull()
    expect(root.textContent ?? '').toContain('<div>还没结束')
  })

  it('keeps a closed html fence as a code sample', async () => {
    const root = await renderMarkdown(visualFence(COMPARISON, 'html'))
    expect(root.querySelector('[data-testid="inline-visual"]')).toBeNull()
    expect(root.textContent ?? '').toContain('方案 A vs 方案 B')
    expect(root.textContent ?? '').toContain('grid-template-columns')
  })

  it('falls back to code when the visual source is oversized', async () => {
    const huge = `<div>${'x'.repeat(INLINE_VISUAL_SOURCE_MAX_BYTES + 8)}</div>`
    const root = await renderMarkdown(visualFence(huge))
    expect(root.querySelector('[data-testid="inline-visual"]')).toBeNull()
    expect(root.textContent ?? '').toContain('xxxx')
  })

  it('does not open a Work Surface when the card chrome is clicked', async () => {
    const onOpenFileRef = vi.fn()
    await render(
      <SimpleMarkdown
        onOpenFileRef={onOpenFileRef}
        source={visualFence(COMPARISON)}
      />,
    )
    const toggle = page.getByTestId('inline-visual-toggle')
    await expect.element(toggle).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(onOpenFileRef).not.toHaveBeenCalled()
    expect(page.getByTestId('simple-markdown').element().querySelector('[data-testid="inline-visual-frame"]')).toBeNull()
  })

  it('does not register html as an official visual language', () => {
    const languages = workbenchMarkdownPlugins.renderers?.flatMap((entry) =>
      Array.isArray(entry.language) ? entry.language : [entry.language],
    )
    expect(languages).toContain('visual')
    expect(languages).not.toContain('html')
    expect(languages).not.toContain('svg')
  })
})
