/**
 * Navigator project picker + Host 降级（浏览器集成）.
 * No-Host 路径保留「默认项目」夹具；Host 注入 FakeHostPort 可新建/打开项目。
 */
import { WorkbenchApp } from '@/app/composition/workbench-app'
import { createFakeHostPort } from '@/modules/project'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

async function waitBooted() {
  await expect
    .element(page.getByTestId('workbench-shell'))
    .toBeInTheDocument()
}

describe('Navigator project surface (Spec-α)', () => {
  it('shows the current project name and disables folder actions without Host', async () => {
    await render(<WorkbenchApp persistence='memory' />)
    await waitBooted()

    const name = page.getByTestId('project-name')
    await expect.element(name).toHaveTextContent('默认项目')
    expect(name.element().classList.contains('sr-only')).toBe(false)

    await userEvent.click(page.getByTestId('navigator-project-trigger'))
    await expect
      .element(page.getByTestId('navigator-project-search'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('navigator-host-unavailable'))
      .toHaveTextContent('浏览器环境无法选择本地文件夹')
    await expect
      .element(page.getByTestId('navigator-open-folder'))
      .toHaveAttribute('data-disabled', '')
    await expect
      .element(page.getByTestId('navigator-create-project'))
      .toHaveAttribute('data-disabled', '')
    await expect
      .element(page.getByTestId('navigator-open-folder'))
      .toHaveTextContent('打开本地文件夹')
    await expect
      .element(page.getByTestId('navigator-create-project'))
      .toHaveTextContent('新建项目')
    const menuText = page.getByTestId('navigator-project-menu').element().textContent ?? ''
    expect(menuText).not.toContain('工作空间')
  })

  it('Fake Host: 新建项目 creates and selects a rooted project', async () => {
    const host = createFakeHostPort()
    await render(
      <WorkbenchApp persistence='memory' hostPort={host} />,
    )
    await waitBooted()

    await expect
      .element(page.getByTestId('project-name'))
      .toHaveTextContent('未选择项目')

    await userEvent.click(page.getByTestId('navigator-project-trigger'))
    await userEvent.click(page.getByTestId('navigator-create-project'))

    await expect
      .element(page.getByTestId('project-name'))
      .toHaveTextContent('未命名项目')
    expect(
      host.calls.some((call) => call.method === 'createProjectDirectory'),
    ).toBe(true)
    expect(host.calls.some((call) => call.method === 'startRuntime')).toBe(true)
  })
})
