import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { type Task } from '../data/schema'
import { TasksMutateDrawer } from './tasks-mutate-drawer'

vi.mock('@/lib/show-submitted-data', () => ({ showSubmittedData: vi.fn() }))

const MOCK_TASK = {
  id: 'task-1',
  title: 'Existing task',
  status: 'in progress',
  label: 'feature',
  priority: 'medium',
} as const satisfies Task

describe('TasksMutateDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders create title and description', async () => {
    const { getByRole, getByText } = await render(
      <TasksMutateDrawer open onOpenChange={vi.fn()} />
    )

    const title = getByRole('heading', {
      level: 2,
      name: /创建任务/,
    })
    const desc = getByText(/填写信息以创建新任务/)

    await expect.element(title).toBeInTheDocument()
    await expect.element(desc).toBeInTheDocument()
  })

  it('renders edit title, description, and prefilled title', async () => {
    const { getByRole, getByText } = await render(
      <TasksMutateDrawer open onOpenChange={vi.fn()} currentRow={MOCK_TASK} />
    )

    const title = getByRole('heading', {
      level: 2,
      name: /更新任务/,
    })
    const desc = getByText(/修改任务信息后保存/)

    const titleInput = getByRole('textbox', { name: /标题/ })
    const statusSelect = getByRole('combobox', { name: /状态/ })
    // Label/priority option labels remain English in product
    const labelRadio = getByRole('radio', { name: /Feature/i })
    const priorityRadio = getByRole('radio', { name: /Medium/i })

    await expect.element(title).toBeInTheDocument()
    await expect.element(desc).toBeInTheDocument()
    await expect.element(titleInput).toHaveValue(MOCK_TASK.title)
    // Uncontrolled SelectDropdown shows the stored value in the trigger.
    await expect
      .element(statusSelect)
      .toHaveTextContent(new RegExp(MOCK_TASK.status, 'i'))
    await expect.element(labelRadio).toBeChecked()
    await expect.element(priorityRadio).toBeChecked()
  })

  it('shows validation messages when submitting an empty form', async () => {
    const { getByRole, getByText } = await render(
      <TasksMutateDrawer open onOpenChange={vi.fn()} />
    )

    const saveButton = getByRole('button', { name: /保存更改/ })
    await userEvent.click(saveButton)

    await expect.element(getByText(/请输入标题。/)).toBeInTheDocument()
    await expect.element(getByText(/请选择状态。/)).toBeInTheDocument()
    await expect.element(getByText(/请选择标签。/)).toBeInTheDocument()
    await expect.element(getByText(/请选择优先级。/)).toBeInTheDocument()
  })

  it('submits create form and shows submitted data', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <TasksMutateDrawer open onOpenChange={onOpenChange} />
    )

    const titleInput = getByRole('textbox', { name: /标题/ })
    await userEvent.fill(titleInput, 'New task title')

    const statusSelect = getByRole('combobox', { name: /状态/ })
    await userEvent.click(statusSelect)
    // Exact match: "待办池" also contains "待办".
    await userEvent.click(getByRole('option', { name: /^待办$/ }))

    await userEvent.click(getByRole('radio', { name: /^Bug$/i }))
    await userEvent.click(getByRole('radio', { name: /^Low$/i }))

    const saveButton = getByRole('button', { name: /保存更改/ })
    await userEvent.click(saveButton)

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    expect(showSubmittedData).toHaveBeenCalledOnce()
    expect(showSubmittedData).toHaveBeenCalledWith({
      title: 'New task title',
      status: 'todo',
      label: 'bug',
      priority: 'low',
    })
  })

  it('closes when Close is clicked', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <TasksMutateDrawer open onOpenChange={onOpenChange} />
    )

    await userEvent.click(
      getByRole('dialog').getByRole('button', { name: /^关闭$/ })
    )

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('resets entered values when the sheet is closed and reopened', async () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Reopen
          </button>
          <TasksMutateDrawer open={open} onOpenChange={setOpen} />
        </>
      )
    }

    const { getByRole } = await render(<Harness />)

    const titleInput = getByRole('textbox', { name: /标题/ })
    await userEvent.fill(titleInput, 'Draft title')
    await expect.element(titleInput).toHaveValue('Draft title')

    const statusSelect = getByRole('combobox', { name: /状态/ })
    await userEvent.click(statusSelect)
    await userEvent.click(getByRole('option', { name: /^待办$/ }))
    // Trigger shows the stored value (`todo`), not the option label.
    await expect.element(statusSelect).toHaveTextContent(/todo/i)

    const labelRadio = getByRole('radio', { name: /^Documentation$/i })
    await userEvent.click(labelRadio)
    await expect.element(labelRadio).toBeChecked()

    const priorityRadio = getByRole('radio', { name: /^High$/i })
    await userEvent.click(priorityRadio)
    await expect.element(priorityRadio).toBeChecked()

    await userEvent.click(
      getByRole('dialog').getByRole('button', { name: /^关闭$/ })
    )

    const reopenButton = getByRole('button', { name: /Reopen/i })
    await userEvent.click(reopenButton)

    await expect.element(titleInput).toHaveValue('')
    await expect.element(statusSelect).not.toHaveTextContent(/todo/i)
    await expect.element(labelRadio).not.toBeChecked()
    await expect.element(priorityRadio).not.toBeChecked()
  })
})
