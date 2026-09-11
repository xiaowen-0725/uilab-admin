/**
 * Closed ```mermaid fences become a shallow-frame figure; failures stay code.
 * Official Streamdown mermaid UI is not the product renderer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  compileMermaidFence,
  workbenchMermaidRuntime,
} from '@/lib/inline-figure/compile-mermaid-svg'
import { SimpleMarkdown } from './simple-markdown'
import { workbenchMarkdownPlugins } from './workbench-markdown-plugins'

const FLOWCHART = `flowchart LR
  A[申请] --> B[经理审批]
  B --> C[写入执行]`

const FIGURE_WAIT_MS = 15_000

function mermaidFence(body: string, language = 'mermaid'): string {
  return ['见下图。', '', '```' + language, body, '```', '', '以上。'].join('\n')
}

function spyMermaidRender() {
  return vi.spyOn(workbenchMermaidRuntime.getMermaid(), 'render')
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

async function expectInlineFigure(): Promise<Element> {
  const figure = page.getByTestId('inline-figure')
  await expect.element(figure, { timeout: FIGURE_WAIT_MS }).toBeInTheDocument()
  return figure.element()
}

async function expectFenceFallback(
  root: Element,
  snippet: string,
): Promise<void> {
  await vi.waitFor(
    () => {
      expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
      expect(root.textContent ?? '').toContain(snippet)
    },
    { timeout: FIGURE_WAIT_MS },
  )
}

describe('SimpleMarkdown inline mermaid figures', { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
  })

  it('does not wire the official Streamdown mermaid UI plugin', () => {
    expect(workbenchMarkdownPlugins.mermaid).toBeUndefined()
  })

  it('draws a closed mermaid fence as a shallow-frame figure', async () => {
    await renderMarkdown(mermaidFence(FLOWCHART))

    const figure = await expectInlineFigure()
    expect(figure.getAttribute('role')).toBe('img')
    expect(figure.getAttribute('aria-label')).toBe('行内图')
    const svg = figure.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(svg?.querySelector('foreignObject')).toBeNull()
    expect(figure.querySelector('button')).toBeNull()
    expect(
      document.querySelector('[data-streamdown="mermaid-block"]'),
    ).toBeNull()
    expect(figure.textContent ?? '').not.toContain('```mermaid')
  })

  it('treats Mermaid info-string case as the same language', async () => {
    await renderMarkdown(mermaidFence(FLOWCHART, 'Mermaid'))
    const figure = await expectInlineFigure()
    expect(figure.querySelector('svg')).not.toBeNull()
  })

  it('keeps an unclosed fence as a code block and does not compile', async () => {
    const spy = spyMermaidRender()
    const root = await renderMarkdown(
      ['流式中', '', '```mermaid', 'flowchart LR', '  A[申请] --> B[经理'].join(
        '\n',
      ),
      true,
    )
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.textContent ?? '').toContain('flowchart LR')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(spy).not.toHaveBeenCalled()
  })

  it('falls back to the original fence source when mermaid syntax fails', async () => {
    const root = await renderMarkdown(
      mermaidFence('this is not a mermaid diagram'),
    )
    await expectFenceFallback(root, 'this is not a mermaid diagram')
    expect(root.textContent ?? '').not.toContain('无法绘制')
  })

  it('falls back to the original fence when mermaid.render throws', async () => {
    spyMermaidRender().mockRejectedValue(new Error('boom'))
    const root = await renderMarkdown(mermaidFence(FLOWCHART))
    await expectFenceFallback(root, 'flowchart LR')
    expect(root.textContent ?? '').not.toContain('无法绘制')
  })

  it('falls back to code when compiled output contains foreignObject', async () => {
    spyMermaidRender().mockResolvedValue({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"><div>x</div></foreignObject></svg>`,
    })
    const root = await renderMarkdown(mermaidFence(FLOWCHART))
    await expectFenceFallback(root, 'flowchart LR')
    expect(root.querySelector('foreignObject')).toBeNull()
  })

  it('uses workbench colors in dark theme instead of a default light fill', async () => {
    document.documentElement.classList.add('dark')
    await renderMarkdown(mermaidFence(FLOWCHART))
    const figure = await expectInlineFigure()
    const fills = [...figure.querySelectorAll('[fill]')].map(
      (el) => el.getAttribute('fill') ?? '',
    )
    expect(fills.some((fill) => isLightPaint(fill))).toBe(false)
    const nodeFills = [...figure.querySelectorAll('rect')]
      .map((el) => el.getAttribute('fill') ?? '')
      .filter(Boolean)
    expect(nodeFills.length).toBeGreaterThan(0)
    expect(nodeFills.some((fill) => isDarkishPaint(fill))).toBe(true)
  })

  it('does not open a Work Surface when the figure is clicked', async () => {
    const onOpenFileRef = vi.fn()
    await render(
      <SimpleMarkdown
        onOpenFileRef={onOpenFileRef}
        source={mermaidFence(FLOWCHART)}
      />,
    )
    const figure = page.getByTestId('inline-figure')
    await expect.element(figure, { timeout: FIGURE_WAIT_MS }).toBeInTheDocument()
    await userEvent.click(figure)
    expect(onOpenFileRef).not.toHaveBeenCalled()
  })
})

describe('compileMermaidFence', { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('peels mermaid style and class before returning svg', async () => {
    const svg = await compileMermaidFence(FLOWCHART)
    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/<style[\s>]/i)
    expect(svg).not.toMatch(/\sclass=/i)
    expect(svg).not.toMatch(/foreignObject/i)
  })

  it('does not call mermaid.render when the fence source is over about 64 KiB', async () => {
    const spy = spyMermaidRender()
    const source = `flowchart LR\n  A[${'x'.repeat(64 * 1024)}]`
    expect(await compileMermaidFence(source)).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})

function isLightPaint(value: string): boolean {
  const t = value.trim().toLowerCase()
  if (t === '#fff' || t === '#ffffff' || t === 'white') return true
  const rgb = parseRgb(t)
  if (!rgb) return false
  return rgb.r > 240 && rgb.g > 240 && rgb.b > 240
}

function isDarkishPaint(value: string): boolean {
  const rgb = parseRgb(value.trim().toLowerCase())
  if (!rgb) return false
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 < 0.45
}

function parseRgb(
  value: string,
): { r: number; g: number; b: number } | null {
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (!hex) return null
  const n = Number.parseInt(hex[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
