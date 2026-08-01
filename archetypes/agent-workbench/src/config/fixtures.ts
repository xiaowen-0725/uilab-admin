/**
 * Static Phase 3 app fixtures only — not a real Agent Runtime projection.
 * View-data types are owned by Task Module; this file supplies seed data only.
 */

import type { ContextSection, ExecutionItem } from '@/modules/task'
import type { WorkbenchSessionSeed } from '@/modules/workbench-session'

export interface TaskFixture {
  taskId: string
  execution: ExecutionItem[]
  context: ContextSection[]
}

export const phase3SessionSeed: WorkbenchSessionSeed = {
  project: {
    id: 'proj-uilab-demo',
    name: 'UI Lab 演示项目',
  },
  tasks: [
    {
      id: 'task-a',
      title: '任务 A · 布局规格',
      subtitle: '验证 Task-only 与 Context 占位',
    },
    {
      id: 'task-b',
      title: '任务 B · 浏览器预览',
      subtitle: '验证 Work Surface 与 tabs',
    },
    {
      id: 'task-c',
      title: '任务 C · 静态 fixture',
      subtitle: '验证 Task 切换恢复布局',
    },
  ],
  selectedTaskId: 'task-a',
  workSurfaceTabs: [
    { id: 'tab-layout', label: '布局规格.md' },
    { id: 'tab-browser', label: '浏览器预览' },
  ],
}

export const taskFixtures: Record<string, TaskFixture> = {
  'task-a': {
    taskId: 'task-a',
    execution: [
      {
        id: 'a-u1',
        kind: 'user',
        body: '先搭一个 Task-first 的 Workbench Shell，Context 要自适应宽度。',
      },
      {
        id: 'a-a1',
        kind: 'assistant',
        body: '收到。这是静态 fixture 中的助手回复：宽 Task 使用 reserved-space Context，窄 Task 切换为 overlay 卡片。',
      },
      {
        id: 'a-t1',
        kind: 'tool',
        title: 'read_layout_spec',
        status: 'completed',
        body: '已完成（fixture）· 读取 docs/plans/phase-3-workbench-shell-skeleton-work-order.md',
      },
      {
        id: 'a-a2',
        kind: 'assistant',
        body: '当前数据明确标注为静态 Phase 3 fixture，不会调用真实 Runtime。',
      },
    ],
    context: [
      {
        id: 'env',
        title: '环境',
        items: ['Web Renderer', 'Phase 3 Shell', '无 Agent Runtime'],
      },
      {
        id: 'changes',
        title: '变更',
        items: ['+ workbench-shell', '+ task surface', '+ context panel'],
      },
      {
        id: 'source',
        title: '来源',
        items: ['fixtures.ts', 'work order Phase 3'],
      },
      {
        id: 'subagent',
        title: '子 Agent',
        items: ['（无）— 本阶段不模拟子 Run'],
      },
    ],
  },
  'task-b': {
    taskId: 'task-b',
    execution: [
      {
        id: 'b-u1',
        kind: 'user',
        body: '打开 Work Surface，切换「布局规格.md」与「浏览器预览」两个占位 tab。',
      },
      {
        id: 'b-a1',
        kind: 'assistant',
        body: 'Work Surface Host 是 Single-pane + Tabs 占位。具体 Document / Browser Surface 在 Phase 6 交付。',
      },
      {
        id: 'b-t1',
        kind: 'tool',
        title: 'open_placeholder_surface',
        status: 'completed',
        body: '已完成（fixture）· 未注册真实 Surface Module',
      },
    ],
    context: [
      {
        id: 'env',
        title: '环境',
        items: ['静态 fixture', 'Tabs host'],
      },
      {
        id: 'changes',
        title: '变更',
        items: ['Work Surface open/close', 'tab activation'],
      },
      {
        id: 'source',
        title: '来源',
        items: ['placeholder tabs only'],
      },
      {
        id: 'subagent',
        title: '子 Agent',
        items: ['（无）'],
      },
    ],
  },
  'task-c': {
    taskId: 'task-c',
    execution: [
      {
        id: 'c-u1',
        kind: 'user',
        body: '在 Task A 与 Task C 之间切换，确认布局状态互不污染。',
      },
      {
        id: 'c-a1',
        kind: 'assistant',
        body: '每个 Task 独立保存 Context / Work Surface 显隐 / 宽度 / 活动 tab / 最大化状态。',
      },
      {
        id: 'c-t1',
        kind: 'tool',
        title: 'snapshot_layout',
        status: 'completed',
        body: '已完成（fixture）· 布局状态按 taskId 作用域隔离',
      },
    ],
    context: [
      {
        id: 'env',
        title: '环境',
        items: ['task-scoped layout'],
      },
      {
        id: 'changes',
        title: '变更',
        items: ['selectTask restore'],
      },
      {
        id: 'source',
        title: '来源',
        items: ['workbench-session reducer'],
      },
      {
        id: 'subagent',
        title: '子 Agent',
        items: ['（无）'],
      },
    ],
  },
}

export function getTaskFixture(taskId: string): TaskFixture {
  return taskFixtures[taskId] ?? taskFixtures['task-a']
}
