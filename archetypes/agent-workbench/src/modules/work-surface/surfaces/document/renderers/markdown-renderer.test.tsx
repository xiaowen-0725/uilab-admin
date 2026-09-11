/**
 * Document .md preview shares Timeline's plugin / renderer / sanitizer config.
 * Closed svg / mermaid fences become the same shallow-frame figure.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { MarkdownRenderer } from './markdown-renderer'

const FLOWCHART = `flowchart LR
  A[申请] --> B[经理审批]
  B --> C[写入执行]`

const FIGURE_WAIT_MS = 15_000

function fence(body: string, language: string): string {
  return ['见下图。', '', '```' + language, body, '```', '', '以上。'].join('\n')
}

async function renderDocumentMarkdown(source: string): Promise<Element> {
  await render(
    <MarkdownRenderer resourceKey='notes/diagram.md' source={source} />,
  )
  const root = page.getByTestId('document-renderer-markdown')
  await expect.element(root).toBeInTheDocument()
  return root.element()
}

async function expectInlineFigure(): Promise<Element> {
  const figure = page.getByTestId('inline-figure')
  await expect.element(figure, { timeout: FIGURE_WAIT_MS }).toBeInTheDocument()
  return figure.element()
}

function expectFenceSource(root: Element, snippet: string): void {
  expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
  expect(root.textContent ?? '').toContain(snippet)
}

describe('Document MarkdownRenderer inline figures', { timeout: 20_000 }, () => {
  it('draws a closed svg fence as a shallow-frame figure', async () => {
    const root = await renderDocumentMarkdown(
      fence(
        `<svg viewBox="0 0 10 10">
  <title>上周用量</title>
  <rect width="10" height="10" fill="#dc2626"/>
</svg>`,
        'svg',
      ),
    )

    const figure = await expectInlineFigure()
    expect(figure.getAttribute('role')).toBe('img')
    expect(figure.getAttribute('aria-label')).toBe('上周用量')
    expect(figure.querySelector('button')).toBeNull()
    expect(figure.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626')
    expect(root.textContent ?? '').not.toContain('```svg')
  })

  it('draws a closed mermaid fence as a shallow-frame figure', async () => {
    const root = await renderDocumentMarkdown(fence(FLOWCHART, 'mermaid'))
    const figure = await expectInlineFigure()
    expect(figure.getAttribute('role')).toBe('img')
    expect(figure.querySelector('svg')).not.toBeNull()
    expect(figure.querySelector('foreignObject')).toBeNull()
    expect(figure.querySelector('button')).toBeNull()
    expect(root.textContent ?? '').not.toContain('```mermaid')
  })

  it('keeps an unclosed svg fence as a code block', async () => {
    const root = await renderDocumentMarkdown(
      [
        '流式中',
        '',
        '```svg',
        '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/>',
      ].join('\n'),
    )
    expectFenceSource(root, 'fill="#dc2626"')
  })

  it('falls back to the original fence source when sanitizing fails', async () => {
    const dirty =
      '<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>'
    const root = await renderDocumentMarkdown(fence(dirty, 'svg'))
    expectFenceSource(root, 'onclick="alert(1)"')
    expect(root.querySelector('rect')).toBeNull()
    expect(root.textContent ?? '').not.toContain('无法绘制')
  })

  it('does not open a Work Surface when the figure is clicked', async () => {
    await renderDocumentMarkdown(
      fence(
        '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#0cbf5b"/></svg>',
        'svg',
      ),
    )
    await expectInlineFigure()
    await userEvent.click(page.getByTestId('inline-figure'))
    expect(document.querySelector('[data-kind="interactive"]')).toBeNull()
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()
  })
})
