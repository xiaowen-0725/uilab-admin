import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { FoldableBody, PROCESS_PROSE_PREVIEW } from './foldable-body'

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
})
