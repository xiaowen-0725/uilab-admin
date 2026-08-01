import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { Button } from '@uilab/foundation/ui/button'

describe('Foundation Button (@uilab/foundation/ui/button)', () => {
  it('renders as a button', async () => {
    const screen = await render(<Button>保存</Button>)
    const button = screen.getByRole('button', { name: '保存' })
    await expect.element(button).toBeInTheDocument()
    await expect.element(button).toHaveAttribute('data-slot', 'button')
  })

  it('fires click handlers', async () => {
    const onClick = vi.fn()
    const screen = await render(<Button onClick={onClick}>提交</Button>)
    await userEvent.click(screen.getByRole('button', { name: '提交' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('honors disabled', async () => {
    const onClick = vi.fn()
    const screen = await render(
      <Button disabled onClick={onClick}>
        禁用
      </Button>
    )
    const button = screen.getByRole('button', { name: '禁用' })
    await expect.element(button).toBeDisabled()
    // Browser userEvent refuses clicks on disabled controls; assert native disabled + no prior fire.
    expect(button.element().hasAttribute('disabled')).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('retains variant and size semantics via class tokens', async () => {
    const screen = await render(
      <div>
        <Button variant='default' size='default'>
          默认
        </Button>
        <Button variant='destructive' size='lg'>
          危险
        </Button>
        <Button variant='outline' size='sm'>
          描边
        </Button>
      </div>
    )

    const defaultBtn = screen.getByRole('button', { name: '默认' })
    const destructiveBtn = screen.getByRole('button', { name: '危险' })
    const outlineBtn = screen.getByRole('button', { name: '描边' })

    const defaultClass = defaultBtn.element().className
    const destructiveClass = destructiveBtn.element().className
    const outlineClass = outlineBtn.element().className

    expect(defaultClass).toContain('bg-primary')
    expect(defaultClass).toContain('h-8')
    expect(destructiveClass).toContain('bg-destructive/10')
    expect(destructiveClass).toContain('h-9')
    expect(outlineClass).toContain('border-border')
    expect(outlineClass).toContain('h-7')
  })
})
