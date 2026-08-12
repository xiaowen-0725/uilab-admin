import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  resetPermissionPresetStoreForTests,
  setPermissionPreset,
} from '../../application/permission-preset'
import { TaskComposer } from './composer'

describe('Composer default-permission preset', () => {
  beforeEach(() => {
    resetPermissionPresetStoreForTests()
  })

  it('shows 帮我批准 as the default chip label', async () => {
    render(
      <TaskComposer mode='runtime' capabilityTaskId='task-composer-default' />,
    )

    await expect
      .element(page.getByTestId('composer-permission-preset'))
      .toHaveTextContent('帮我批准')
  })

  it('lists both Chinese presets with descriptions and switches to 完全访问', async () => {
    render(
      <TaskComposer mode='runtime' capabilityTaskId='task-composer-switch' />,
    )

    await userEvent.click(page.getByTestId('composer-permission-preset'))

    await expect
      .element(page.getByTestId('composer-permission-preset-auto-approve'))
      .toHaveTextContent('帮我批准')
    await expect
      .element(page.getByTestId('composer-permission-preset-auto-approve'))
      .toHaveTextContent('文件修改自动批准；执行命令等高风险操作仍会询问')
    await expect
      .element(page.getByTestId('composer-permission-preset-full-access'))
      .toHaveTextContent('完全访问')
    await expect
      .element(page.getByTestId('composer-permission-preset-full-access'))
      .toHaveTextContent('不再逐次询问；操作仍在工作区沙箱内执行')

    await userEvent.click(
      page.getByTestId('composer-permission-preset-full-access'),
    )

    await expect
      .element(page.getByTestId('composer-permission-preset'))
      .toHaveTextContent('完全访问')
  })

  it('keeps full-access on Task A while Task B stays at the default', async () => {
    setPermissionPreset('task-a', 'full-access')

    function Switcher() {
      const [taskId, setTaskId] = useState('task-a')
      return (
        <div>
          <button
            type='button'
            data-testid='switch-to-task-b'
            onClick={() => setTaskId('task-b')}
          >
            切换
          </button>
          <TaskComposer mode='runtime' capabilityTaskId={taskId} />
        </div>
      )
    }

    render(<Switcher />)

    await expect
      .element(page.getByTestId('composer-permission-preset'))
      .toHaveTextContent('完全访问')

    await userEvent.click(page.getByTestId('switch-to-task-b'))

    await expect
      .element(page.getByTestId('composer-permission-preset'))
      .toHaveTextContent('帮我批准')
  })
})
