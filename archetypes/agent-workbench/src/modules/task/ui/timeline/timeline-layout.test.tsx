/**
 * Conversation-stream layout: process recedes, list reads as one group.
 */
import {
  emptyProjectionState,
  projectEvents,
  TaskSurface,
  type AgentRuntimeEventEnvelope,
  type TaskSurfaceView,
} from '@/modules/task'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'

const LIST_BODY = [
  '我是本地 Office Agent Runtime。',
  '',
  '- **技能驱动的工作流**：会议纪要、周报',
  '- **工作区文件操作**：读写 `/notes/`',
  '- **执行沙箱命令**：需宿主批准',
  '',
  '这是本机办公侧车，不是远程集群。',
  '',
  `${'长文不该在答案槽出现收起。'.repeat(40)}`,
].join('\n')

function envelope(
  eventType: string,
  taskSequence: number,
  payload: unknown = {},
): AgentRuntimeEventEnvelope {
  return {
    eventId: `e${taskSequence}`,
    eventType,
    schemaVersion: 2,
    projectId: 'p',
    taskId: 'task-layout',
    turnId: 'turn-1',
    taskSequence,
    occurredAt: '1970-01-01T00:00:00.000Z',
    receivedAt: '1970-01-01T00:00:00.000Z',
    payload,
  }
}

function px(value: string): number {
  return Number.parseFloat(value)
}

describe('Timeline conversation layout', () => {
  it('keeps a single process quiet and packs the answer list', async () => {
    const { readModel } = projectEvents(
      emptyProjectionState({
        taskId: 'task-layout',
        projectId: 'p',
        title: '呈现',
      }),
      [
        envelope('turn.started', 1, { inputText: '你是谁', text: '你是谁' }),
        envelope('reasoning.started', 2),
        envelope('reasoning.delta', 3, { text: 'The user asked who I am.' }),
        envelope('reasoning.completed', 4),
        envelope('message.delta', 5, { text: LIST_BODY }),
        envelope('message.completed', 6, { text: LIST_BODY }),
        envelope('turn.completed', 7, { durationMs: 1000 }),
      ],
    )
    const view: TaskSurfaceView = {
      taskId: 'task-layout',
      title: readModel.title,
      projectName: '测试项目',
      mode: 'runtime',
      readModel,
      launchActions: [],
      contextSections: [],
      contextPanelOpen: false,
    }
    render(
      <TaskSurface
        view={view}
        composerRuntime={{
          mode: 'runtime',
          turnStatus: readModel.turnStatus,
        }}
      />,
    )

    await expect.element(page.getByTestId('task-timeline')).toBeInTheDocument()
    const label = page.getByTestId('timeline-turn-status-label')
    await expect.element(label).toHaveTextContent(/已完成/)
    expect(label.element().textContent ?? '').not.toMatch(/项过程/)
    expect(
      document.querySelector(
        '[data-testid="timeline-working-block"] [data-slot="separator"]',
      ),
    ).not.toBeNull()
    expect(
      document.querySelector(
        '[data-slot="process-fold-body"]',
      )?.className,
    ).not.toMatch(/border-s/)

    const markdown = document.querySelector('[data-testid="simple-markdown"]')
    expect(markdown).not.toBeNull()
    const intro = markdown?.querySelector('p')
    const list = markdown?.querySelector('ul')
    const items = [...(markdown?.querySelectorAll('li') ?? [])]
    const closer = markdown?.querySelector('ul + p, ul + div p')
    expect(intro).not.toBeNull()
    expect(list).not.toBeNull()
    expect(items).toHaveLength(3)

    const introStyle = getComputedStyle(intro!)
    const listStyle = getComputedStyle(list!)
    expect(px(introStyle.marginBottom)).toBe(4)
    expect(px(listStyle.marginTop)).toBe(0)
    expect(px(listStyle.marginBottom)).toBe(16)
    expect(px(getComputedStyle(items[0]!).marginBottom)).toBe(4)
    expect(px(getComputedStyle(items[2]!).marginBottom)).toBe(0)
    if (closer) {
      expect(px(getComputedStyle(closer).marginTop)).toBe(0)
    }

    expect(document.querySelector('[data-testid^="timeline-fold-toggle-"]')).toBeNull()
    await userEvent.click(page.getByTestId('timeline-turn-toggle'))
    const reasoning = document.querySelector('[data-category="reasoning-section"]')
    expect(reasoning?.textContent ?? '').toContain('The user asked who I am.')
    expect(reasoning?.textContent ?? '').not.toContain('思考过程')
  })
})
