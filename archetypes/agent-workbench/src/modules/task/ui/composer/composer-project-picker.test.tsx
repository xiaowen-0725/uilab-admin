import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TaskComposer } from './composer'

const catalog = [
  { id: 'project-default', name: '默认项目', specified: false },
  { id: 'project-alpha', name: 'Alpha', specified: true },
]

describe('Composer project picker', () => {
  it('uses Host commands when the product picker is wired', async () => {
    const onSelectProject = vi.fn()
    const onOpenLocalFolder = vi.fn()
    const onCreateProject = vi.fn()
    const onClearProject = vi.fn()

    render(
      <div className='flex min-h-[100vh] items-end p-8'>
        <TaskComposer
          mode='runtime'
          projectLabel='默认项目'
          projectPicker={{
            projects: catalog,
            selectedProjectId: 'project-alpha',
            hostAvailable: true,
            onSelectProject,
            onOpenLocalFolder,
            onCreateProject,
            onClearProject,
          }}
        />
      </div>,
    )

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-option-project-alpha'))
    expect(onSelectProject).toHaveBeenCalledWith('project-alpha')

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-open-folder'))
    expect(onOpenLocalFolder).toHaveBeenCalledTimes(1)

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-create'))
    await userEvent.fill(page.getByTestId('composer-create-project-input'), '桌面项目')
    await userEvent.click(page.getByTestId('composer-create-project-confirm'))
    expect(onCreateProject).toHaveBeenCalledWith('桌面项目')
    expect(page.getByTestId('composer-notice').element().textContent).toContain(
      '已新建项目「桌面项目」',
    )
    expect(page.getByTestId('composer-notice').element().textContent).not.toContain(
      '本地模拟',
    )

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-clear'))
    expect(onClearProject).toHaveBeenCalledTimes(1)
    expect(page.getByTestId('composer-notice').element().textContent).toContain(
      '已取消使用项目',
    )
  })

  it('disables create/open without Host and does not local-sim', async () => {
    const onOpenLocalFolder = vi.fn()
    const onCreateProject = vi.fn()

    render(
      <div className='flex min-h-[100vh] items-end p-8'>
        <TaskComposer
          mode='runtime'
          projectLabel='默认项目'
          projectPicker={{
            projects: catalog,
            selectedProjectId: 'project-default',
            hostAvailable: false,
            onSelectProject: vi.fn(),
            onOpenLocalFolder,
            onCreateProject,
            onClearProject: vi.fn(),
          }}
        />
      </div>,
    )

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await expect
      .element(page.getByTestId('composer-project-create'))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(page.getByTestId('composer-project-open-folder'))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(page.getByTestId('composer-project-host-unavailable'))
      .toHaveTextContent('浏览器环境无法选择本地文件夹')
    expect(
      document.querySelector('[data-testid="composer-project-clear"]'),
    ).toBeNull()
    expect(onOpenLocalFolder).not.toHaveBeenCalled()
    expect(onCreateProject).not.toHaveBeenCalled()
  })

  it('shows 选择项目 on the chip and hides 不使用项目 until a specified project is selected', async () => {
    render(
      <div className='flex min-h-[100vh] items-end p-8'>
        <TaskComposer
          mode='runtime'
          projectLabel='默认项目'
          projectPicker={{
            projects: catalog,
            selectedProjectId: 'project-default',
            hostAvailable: true,
            onSelectProject: vi.fn(),
            onOpenLocalFolder: vi.fn(),
            onCreateProject: vi.fn(),
            onClearProject: vi.fn(),
          }}
        />
      </div>,
    )

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('选择项目')
    await userEvent.click(page.getByTestId('composer-chip-project'))
    expect(
      document.querySelector('[data-testid="composer-project-option-project-default"]'),
    ).toBeNull()
    await expect
      .element(page.getByTestId('composer-project-option-project-alpha'))
      .toBeInTheDocument()
    expect(
      document.querySelector('[data-testid="composer-project-clear"]'),
    ).toBeNull()
  })

  it('shows 不使用项目 in the menu only after a specified project is selected', async () => {
    render(
      <div className='flex min-h-[100vh] items-end p-8'>
        <TaskComposer
          mode='runtime'
          projectLabel='Alpha'
          projectPicker={{
            projects: catalog,
            selectedProjectId: 'project-alpha',
            hostAvailable: true,
            onSelectProject: vi.fn(),
            onOpenLocalFolder: vi.fn(),
            onCreateProject: vi.fn(),
            onClearProject: vi.fn(),
          }}
        />
      </div>,
    )

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('Alpha')
    await userEvent.click(page.getByTestId('composer-chip-project'))
    await expect
      .element(page.getByTestId('composer-project-clear'))
      .toHaveTextContent('不使用项目')
  })
})
