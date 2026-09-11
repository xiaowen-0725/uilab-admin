/**
 * Document .md preview shares Timeline's plugin / renderer / sanitizer config.
 * Closed mermaid fences become a shallow-frame figure; visual fences become
 * a sandboxed HTML card; svg fences stay code.
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
  it('keeps a closed svg fence as a code block', async () => {
    const root = await renderDocumentMarkdown(
      fence(
        `<svg viewBox="0 0 10 10">
  <title>上周用量</title>
  <rect width="10" height="10" fill="#dc2626"/>
</svg>`,
        'svg',
      ),
    )

    expectFenceSource(root, 'fill="#dc2626"')
    expect(root.querySelector('rect')).toBeNull()
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

  it('does not open a Work Surface when the mermaid figure is clicked', async () => {
    await renderDocumentMarkdown(fence(FLOWCHART, 'mermaid'))
    await expectInlineFigure()
    await userEvent.click(page.getByTestId('inline-figure'))
    expect(document.querySelector('[data-kind="interactive"]')).toBeNull()
    expect(
      document.querySelector('[data-testid="work-surface-interactive"]'),
    ).toBeNull()
  })

  it('draws a closed visual fence as a sandboxed island card', async () => {
    const root = await renderDocumentMarkdown(
      fence(
        `<title>方案对照</title><div style="display:grid;grid-template-columns:1fr 1fr"><section>A</section><section>B</section></div>`,
        'visual',
      ),
    )
    const card = page.getByTestId('inline-visual')
    await expect.element(card).toBeInTheDocument()
    await expect.element(card).toHaveTextContent('方案对照')
    const iframe = page.getByTestId('inline-visual-frame').element()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
  })
})
