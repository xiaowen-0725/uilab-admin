/**
 * Composer is an input, not a figure previewer.
 */
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TaskComposer } from './composer'

const SVG_FENCE = [
  '```svg',
  '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#dc2626"/></svg>',
  '```',
].join('\n')

describe('Composer inline-figure boundary', () => {
  it('does not preview a pasted svg fence as a figure', async () => {
    await render(<TaskComposer mode='runtime' />)
    const input = page.getByTestId('composer-input')
    await expect.element(input).toBeInTheDocument()
    await userEvent.fill(input, SVG_FENCE)

    const field = input.element()
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new TypeError('composer-input must be a textarea')
    }
    expect(field.value).toContain('```svg')
    expect(field.value).toContain('fill="#dc2626"')
    const composer = page.getByTestId('composer').element()
    expect(composer.querySelector('[data-testid="inline-figure"]')).toBeNull()
    expect(composer.querySelector('[data-testid="inline-visual"]')).toBeNull()
    expect(composer.querySelector('[data-testid="simple-markdown"]')).toBeNull()
  })
})
