import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TaskComposer } from './composer'

async function selectApiDesignSkill(): Promise<void> {
  await userEvent.click(page.getByTestId('composer-input'))
  await userEvent.keyboard('/api')
  await expect
    .element(page.getByTestId('composer-slash-skill-api-design'))
    .toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
}

describe('TaskComposer skill tokens', () => {
  it('keeps a removable skill tag on the first draft line', async () => {
    await render(<TaskComposer mode='runtime' />)
    await selectApiDesignSkill()
    await userEvent.fill(page.getByTestId('composer-input'), '11')

    const chip = page.getByTestId('composer-skill-skill-api-design')
    await expect.element(chip).toHaveAttribute('aria-label', '移除 API Design')

    const chipBox = chip.element().getBoundingClientRect()
    const field = page.getByTestId('composer-input').element()
    const indent = Number.parseFloat(getComputedStyle(field).textIndent)
    expect(indent).toBeGreaterThanOrEqual(chipBox.width)
    expect(Math.abs(field.getBoundingClientRect().top - chipBox.top)).toBeLessThan(8)
  })

  it('lets wrapped draft lines start under the skill tag', async () => {
    await render(<TaskComposer mode='runtime' />)
    await selectApiDesignSkill()
    await userEvent.fill(
      page.getByTestId('composer-input'),
      'first line\nsecond line starts at the left edge',
    )

    const chipBox = page
      .getByTestId('composer-skill-skill-api-design')
      .element()
      .getBoundingClientRect()
    const field = page.getByTestId('composer-input').element()
    const fieldBox = field.getBoundingClientRect()
    const indent = Number.parseFloat(getComputedStyle(field).textIndent)

    expect(indent).toBeGreaterThanOrEqual(chipBox.width)
    expect(fieldBox.left).toBeLessThanOrEqual(chipBox.left + 2)
    expect(fieldBox.height).toBeGreaterThan(chipBox.height + 8)
  })
})
