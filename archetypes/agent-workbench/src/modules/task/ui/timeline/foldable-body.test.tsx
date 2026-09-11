import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { FoldableBody, PROCESS_PROSE_PREVIEW } from './foldable-body'

const SVG_FENCE = [
  '过程旁白',
  '```svg',
  '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/></svg>',
  '```',
].join('\n')

describe('FoldableBody compact process prose', () => {
  it('keeps a long process aside to a short preview', async () => {
    const body = `${'这段过程旁白不该整段落进主列。'.repeat(12)}`
    render(<FoldableBody itemId='aside-1' body={body} muted compact />)
    await expect.element(page.getByTestId('timeline-fold-aside-1')).toBeInTheDocument()
    const root = page.getByTestId('timeline-fold-aside-1').element()
    expect(root.textContent ?? '').toContain('展开')
    expect(root.textContent ?? '').not.toContain(body)
    expect((root.textContent ?? '').length).toBeLessThan(PROCESS_PROSE_PREVIEW + 8)
  })

  it('keeps a default (non-markdown) fence as characters, not a figure', async () => {
    render(
      <div data-testid='foldable-plain'>
        <FoldableBody itemId='aside-svg' body={SVG_FENCE} muted compact />
      </div>,
    )
    const root = page.getByTestId('foldable-plain')
    await expect.element(root).toBeInTheDocument()
    const el = root.element()
    expect(el.querySelector('[data-testid="simple-markdown"]')).toBeNull()
    expect(el.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(el.textContent ?? '').toContain('```svg')
    expect(el.textContent ?? '').toContain('fill="#dc2626"')
  })
})
