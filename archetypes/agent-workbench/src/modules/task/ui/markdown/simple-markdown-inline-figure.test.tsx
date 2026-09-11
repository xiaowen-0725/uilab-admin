/**
 * Closed ```svg fences stay code. Inline figures only come from mermaid.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
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

describe('SimpleMarkdown svg fences are not figures', () => {
  it('keeps a closed svg fence as a code block', async () => {
    const root = await renderMarkdown(
      svgFence(`<svg viewBox="0 0 10 10">
  <title>上周用量</title>
  <rect width="10" height="10" fill="#dc2626"/>
</svg>`),
    )

    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.querySelector('[data-testid="inline-visual"]')).toBeNull()
    expect(root.querySelector('svg')).toBeNull()
    expect(root.textContent ?? '').toContain('fill="#dc2626"')
    expect(root.textContent ?? '').toContain('上周用量')
  })

  it('treats SVG info-string case as code too', async () => {
    const root = await renderMarkdown(
      svgFence(
        '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#0cbf5b"/></svg>',
        'SVG',
      ),
    )
    expect(root.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(root.querySelector('circle')).toBeNull()
    expect(root.textContent ?? '').toContain('fill="#0cbf5b"')
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

  it('does not insert forbidden tags from an svg fence', async () => {
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
})
