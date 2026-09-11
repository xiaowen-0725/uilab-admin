/**
 * Closed ```svg fences become a shallow-frame figure; failures stay code.
 * File-path chips still ride inlineCode after the code-component handover.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { SimpleMarkdown } from './simple-markdown'

function svgFence(body: string, language = 'svg'): string {
  return ['见下图。', '', '```' + language, body, '```', '', '以上。'].join('\n')
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

describe('SimpleMarkdown inline SVG figures', () => {
  it('draws a closed svg fence as a shallow-frame figure', async () => {
    await renderMarkdown(
      svgFence(`<svg viewBox="0 0 10 10">
  <title>上周用量</title>
  <rect width="10" height="10" fill="#dc2626"/>
  <path d="M0 10 L10 0" stroke="currentColor"/>
</svg>`),
    )

    const figure = page.getByTestId('inline-figure')
    await expect.element(figure).toBeInTheDocument()
    expect(figure.element().getAttribute('role')).toBe('img')
    expect(figure.element().getAttribute('aria-label')).toBe('上周用量')
    const svg = figure.element().querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(svg?.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626')
    expect(svg?.querySelector('path')?.getAttribute('stroke')).toBe(
      'currentColor',
    )
    expect(figure.element().textContent ?? '').not.toContain('```svg')
  })

  it('treats SVG info-string case as the same language', async () => {
    await renderMarkdown(
      svgFence(
        '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#0cbf5b"/></svg>',
        'SVG',
      ),
    )
    const figure = page.getByTestId('inline-figure')
    await expect.element(figure).toBeInTheDocument()
    expect(figure.element().getAttribute('aria-label')).toBe('行内图')
    expect(figure.element().querySelector('circle')).not.toBeNull()
  })

  it('keeps an unclosed fence as a code block while streaming', async () => {
    const root = await renderMarkdown(
      [
        '流式中',
        '',
        '```svg',
        '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/>',
      ].join('\n'),
      true,
    )
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.textContent ?? '').toContain('fill="#dc2626"')
  })

  it('falls back to the original fence source when sanitizing fails', async () => {
    const dirty =
      '<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>'
    const root = await renderMarkdown(svgFence(dirty))
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.querySelector('rect')).toBeNull()
    const text = root.textContent ?? ''
    expect(text).toContain('onclick="alert(1)"')
    expect(text).not.toContain('无法绘制')
  })

  it('does not insert forbidden tags from a failed svg fence', async () => {
    const tag = 'script'
    const dirty = `<svg viewBox="0 0 10 10"><${tag}>alert(1)</${tag}></svg>`
    const root = await renderMarkdown(svgFence(dirty))
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.querySelector(tag)).toBeNull()
    expect(root.textContent ?? '').toContain(`<${tag}>alert(1)</${tag}>`)
  })

  it('does not draw a bare svg tag in prose', async () => {
    const root = await renderMarkdown(
      '前文 <svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/></svg> 后文',
    )
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.querySelector('svg')).toBeNull()
  })

  it('prefixes ids so a figure cannot clobber a host id', async () => {
    await render(
      <div id='host-root'>
        <SimpleMarkdown
          source={svgFence(`<svg viewBox="0 0 10 10" id="host-root">
  <defs>
    <clipPath id="c">
      <rect width="10" height="10"/>
    </clipPath>
  </defs>
  <rect width="10" height="10" fill="#dc2626" clip-path="url(#c)"/>
</svg>`)}
        />
      </div>,
    )
    const figure = page.getByTestId('inline-figure')
    await expect.element(figure).toBeInTheDocument()
    expect(document.getElementById('host-root')?.tagName).toBe('DIV')
    const svg = figure.element().querySelector('svg')
    expect(svg?.getAttribute('id')).not.toBe('host-root')
    expect(svg?.querySelector('#host-root')).toBeNull()
    expect(svg?.querySelector('[clip-path="url(#c)"]')).toBeNull()
    expect(svg?.querySelector('clipPath')?.id.startsWith('if-')).toBe(true)
  })

  it('still turns inline file paths into chips and highlights fenced code', async () => {
    const root = await renderMarkdown(
      ['打开 `src/foo.ts`。', '', '```ts', 'export const ok = 1', '```'].join('\n'),
    )
    const chip = page.getByTestId('file-reference-chip')
    await expect.element(chip).toHaveTextContent('foo.ts')
    expect(chip.element().getAttribute('data-path')).toBe('src/foo.ts')
    expect(root.textContent ?? '').toContain('export const ok = 1')
    expect(root.querySelector('pre, [data-streamdown]')).not.toBeNull()
  })

  it('does not open a Work Surface when the figure is clicked', async () => {
    const onOpenFileRef = vi.fn()
    await render(
      <SimpleMarkdown
        onOpenFileRef={onOpenFileRef}
        source={svgFence(
          '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#0cbf5b"/></svg>',
        )}
      />,
    )
    const figure = page.getByTestId('inline-figure')
    await expect.element(figure).toBeInTheDocument()
    await userEvent.click(figure)
    expect(onOpenFileRef).not.toHaveBeenCalled()
  })
})
