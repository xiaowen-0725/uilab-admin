/**
 * Composer project picker + Host 降级（浏览器集成）.
 * 项目选择只在 Composer；无 Host 保留「默认项目」夹具；Host 注入 FakeHostPort 可新建项目。
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { createFakeHostPort } from '@/modules/project'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

async function waitComposerReady() {
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
  await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
  await expect.element(page.getByTestId('composer-chip-project')).toBeInTheDocument()
}

describe('Composer project surface (Spec-α)', () => {
  it('cold-starts on Composer with the default project and disables folder actions without Host', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitComposerReady()

    expect(document.querySelector('[data-testid="project-name"]')).toBeNull()
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('选择项目')
    expect(
      document.querySelector('[data-testid="navigator-project-trigger"]'),
    ).toBeNull()

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await expect
      .element(page.getByTestId('composer-project-search'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-project-host-unavailable'))
      .toHaveTextContent('浏览器环境无法选择本地文件夹')
    await expect
      .element(page.getByTestId('composer-project-open-folder'))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(page.getByTestId('composer-project-create'))
      .toHaveAttribute('aria-disabled', 'true')
    const menuText = page.getByTestId('composer-project-menu').element().textContent ?? ''
    expect(menuText).not.toContain('工作空间')
    expect(
      document.querySelector('[data-testid="composer-project-option-project-default"]'),
    ).toBeNull()
    expect(
      document.querySelector('[data-testid="composer-project-clear"]'),
    ).toBeNull()
    expect(document.querySelector('[data-testid="navigator-projects"]')).toBeNull()
    await expect
      .element(page.getByTestId('navigator-tasks'))
      .toHaveTextContent('新对话')
  })

  it('Fake Host: cold start auto-creates a default project; Composer can create another', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('选择项目')
    expect(document.querySelector('[data-testid="navigator-projects"]')).toBeNull()
    expect(
      host.calls.some((call) => call.method === 'createProjectDirectory'),
    ).toBe(true)
    expect(host.calls.some((call) => call.method === 'startRuntime')).toBe(true)

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-create'))
    await userEvent.fill(page.getByTestId('composer-create-project-input'), '桌面项目')
    await userEvent.click(page.getByTestId('composer-create-project-confirm'))

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('桌面项目')
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    await expect
      .element(page.getByTestId('navigator-projects'))
      .toHaveTextContent('桌面项目')
    const deskId = projectGroupIdByName('桌面项目')
    expect(deskId).toBeTruthy()
    await expect
      .element(page.getByTestId(`navigator-project-group-${deskId}`))
      .toHaveTextContent('新对话')
  })

  it('Fake Host: clicking a task under another specified project switches the root', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()

    await createSpecifiedProject('项目甲')
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目甲')
    const firstTaskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(firstTaskId).toBeTruthy()

    await createSpecifiedProject('项目乙')
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目乙')
    const secondTaskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(secondTaskId).toBeTruthy()
    expect(secondTaskId).not.toBe(firstTaskId)

    const alphaId = projectGroupIdByName('项目甲')
    expect(alphaId).toBeTruthy()
    await userEvent.click(
      page.getByTestId(`navigator-project-group-toggle-${alphaId}`),
    )
    await userEvent.click(page.getByTestId(`task-${firstTaskId}`))

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目甲')
    expect(page.getByTestId('task-surface').element().dataset.taskId).toBe(
      firstTaskId,
    )
  })

  it('Fake Host: picking a project restores its conversation without a blank shell', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()

    await createSpecifiedProject('项目甲')
    const firstTaskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(firstTaskId).toBeTruthy()

    await createSpecifiedProject('项目乙')
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目乙')

    const alphaId = projectGroupIdByName('项目甲')
    expect(alphaId).toBeTruthy()
    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId(`composer-project-option-${alphaId}`))

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目甲')
    expect(page.getByTestId('task-surface').element().dataset.taskId).toBe(
      firstTaskId,
    )
    expect(
      document.querySelector('[data-testid="workspace-empty-shell"]'),
    ).toBeNull()
  })

  it('Fake Host: project-row new-chat opens a session on that project', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()

    await createSpecifiedProject('项目甲')
    const firstTaskId = page.getByTestId('task-surface').element().dataset.taskId
    expect(firstTaskId).toBeTruthy()

    await createSpecifiedProject('项目乙')
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目乙')

    const alphaId = projectGroupIdByName('项目甲')
    expect(alphaId).toBeTruthy()
    await userEvent.click(
      page.getByTestId(`navigator-project-new-chat-${alphaId}`),
    )

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('项目甲')
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()
    expect(page.getByTestId('task-surface').element().dataset.taskId).toBe(
      firstTaskId,
    )
    expect(
      host.calls.some(
        (call) =>
          call.method === 'startRuntime' &&
          String(call.args[0] ?? '').includes('项目甲'),
      ),
    ).toBe(true)
  })

  it('Fake Host: removing a specified project drops it from the list and keeps the folder', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()
    await createSpecifiedProject('桌面项目')

    const deskId = projectGroupIdByName('桌面项目')
    expect(deskId).toBeTruthy()
    const createdDirs = [...host.directories]

    await userEvent.click(page.getByTestId(`navigator-project-menu-${deskId}`))
    await userEvent.click(page.getByTestId(`navigator-project-remove-${deskId}`))
    await expect
      .element(page.getByTestId('remove-project-dialog'))
      .toHaveTextContent('本地文件夹不会被删除')
    await userEvent.click(page.getByTestId('remove-project-confirm'))

    await expect
      .element(page.getByTestId('navigator-projects'))
      .not.toBeInTheDocument()
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .not.toHaveTextContent('桌面项目')
    expect(host.calls.some((call) => call.method.includes('delete'))).toBe(false)
    expect([...host.directories]).toEqual(createdDirs)
  })

  it('Fake Host: 不使用项目 returns to the unspecified auto project', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitComposerReady()
    await createSpecifiedProject('桌面项目')

    await userEvent.click(page.getByTestId('composer-chip-project'))
    await userEvent.click(page.getByTestId('composer-project-clear'))

    await expect
      .element(page.getByTestId('composer-chip-project'))
      .not.toHaveTextContent('桌面项目')
    await expect
      .element(page.getByTestId('composer-chip-project'))
      .toHaveTextContent('选择项目')
    await expect.element(page.getByTestId('empty-hub')).toBeInTheDocument()

    await userEvent.click(page.getByTestId('composer-chip-project'))
    expect(
      document.querySelector('[data-testid="composer-project-clear"]'),
    ).toBeNull()
  })
})

function projectGroupIdByName(name: string): string | null {
  for (const el of document.querySelectorAll('[data-testid]')) {
    const testId = el.getAttribute('data-testid') ?? ''
    if (!testId.startsWith('navigator-project-group-')) continue
    if (testId.startsWith('navigator-project-group-toggle-')) continue
    if (el.textContent?.includes(name)) {
      return testId.slice('navigator-project-group-'.length)
    }
  }
  return null
}

async function createSpecifiedProject(name: string) {
  await userEvent.click(page.getByTestId('composer-chip-project'))
  await userEvent.click(page.getByTestId('composer-project-create'))
  await userEvent.fill(page.getByTestId('composer-create-project-input'), name)
  await userEvent.click(page.getByTestId('composer-create-project-confirm'))
  await expect
    .element(page.getByTestId('composer-chip-project'))
    .toHaveTextContent(name)
}
