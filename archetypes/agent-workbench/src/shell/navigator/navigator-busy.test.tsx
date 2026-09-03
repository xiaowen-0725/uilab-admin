import type { TaskSummary } from '@/modules/project'
import { ThemeProvider } from '@/shell/theme/theme-provider'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { Navigator } from './navigator'

const busyTask: TaskSummary = {
  id: 'task-live',
  projectId: 'project-default',
  title: '进行中的任务',
  updatedAt: '2026-08-27T03:00:00.000Z',
}

describe('Navigator busy glyph', () => {
  it('uses the UI Lab dot-matrix loader instead of a spinning arrow', async () => {
    await render(
      <ThemeProvider>
        <Navigator
          looseTasks={[busyTask]}
          projectGroups={[]}
          selectedProjectId={null}
          selectedTaskId={busyTask.id}
          busyTaskIds={new Set([busyTask.id])}
          open
          mode='reserved'
          onSelectTask={() => undefined}
        />
      </ThemeProvider>,
    )

    const glyph = page.getByTestId(`task-busy-${busyTask.id}`)
    await expect.element(glyph).toBeInTheDocument()
    expect(glyph.element().getAttribute('aria-hidden')).toBe('true')
    expect(glyph.element().querySelector('.animate-spin')).toBeNull()
    expect(glyph.element().querySelectorAll('.rounded-full')).toHaveLength(9)

    await expect
      .element(page.getByTestId(`task-${busyTask.id}`))
      .toHaveAttribute('aria-busy', 'true')
  })
})
