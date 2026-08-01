import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { Input } from '@uilab/foundation/ui/input'

describe('Foundation Input (@uilab/foundation/ui/input)', () => {
  it('is labelable via htmlFor / id', async () => {
    const screen = await render(
      <div>
        <label htmlFor='email-field'>邮箱</label>
        <Input id='email-field' type='email' />
      </div>
    )

    const input = screen.getByLabelText('邮箱')
    await expect.element(input).toBeInTheDocument()
    await expect.element(input).toHaveAttribute('data-slot', 'input')
    await expect.element(input).toHaveAttribute('type', 'email')
  })

  it('accepts user text', async () => {
    const screen = await render(<Input aria-label='用户名' />)
    const input = screen.getByLabelText('用户名')
    await userEvent.fill(input, 'alice')
    await expect.element(input).toHaveValue('alice')
  })

  it('honors disabled', async () => {
    const screen = await render(
      <Input aria-label='只读字段' disabled defaultValue='locked' />
    )
    const input = screen.getByLabelText('只读字段')
    await expect.element(input).toBeDisabled()
    await expect.element(input).toHaveValue('locked')
  })

  it('exposes invalid semantics via aria-invalid', async () => {
    const screen = await render(
      <Input aria-label='校验字段' aria-invalid='true' />
    )
    const input = screen.getByLabelText('校验字段')
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.element().className).toContain('aria-invalid:border-destructive')
  })
})
