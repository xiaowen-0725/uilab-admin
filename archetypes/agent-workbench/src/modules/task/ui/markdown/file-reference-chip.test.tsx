import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FileReferenceChip } from './file-reference-chip'

describe('FileReferenceChip', () => {
  it('is static text when no open action is wired', async () => {
    await render(<FileReferenceChip label='result.md' path='/notes/result.md' />)
    const chip = page.getByTestId('file-reference-chip').element()
    expect(chip.tagName).toBe('SPAN')
    expect(chip.getAttribute('role')).toBeNull()
  })

  it('is a real button when an open action is wired', async () => {
    const onOpen = vi.fn()
    await render(
      <FileReferenceChip
        label='result.md'
        path='/notes/result.md'
        onOpen={onOpen}
      />,
    )
    const chip = page.getByTestId('file-reference-chip')
    expect(chip.element().tagName).toBe('BUTTON')
    await userEvent.click(chip)
    expect(onOpen).toHaveBeenCalledWith({
      path: '/notes/result.md',
      line: undefined,
      label: 'result.md',
    })
  })
})
