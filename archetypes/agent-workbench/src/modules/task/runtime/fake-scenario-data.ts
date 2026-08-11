/**
 * Deterministic Fake scenario data & keyword routing (presentation fixtures).
 * Kept separate from FakeRuntime orchestration so stream scripts stay readable.
 */

import type { AgentRuntimeEventType } from '../protocol/events'

export type FakeScenarioName =
  | 'normal-stream-complete'
  | 'cancel-run'
  | 'reasoning-tools-complete'
  | 'fixture-workflow'
  | 'approval-approve'
  | 'approval-reject'
  | 'waiting-input'
  | 'fail-once-retry'
  | 'long-content'
  | 'work-surface-open-document'
  | 'work-surface-open-browser'
  | 'work-surface-open-illegal'

export interface ScenarioStreamStep {
  type: AgentRuntimeEventType
  payload: unknown
}

/** Fixed long markdown for long-content scenario (>2k chars). */
export function buildLongContentDeltas(): string[] {
  const paragraph =
    '这是一段用于 Timeline 折叠与智能滚动验证的长文演示内容。' +
    'Deterministic Fake Runtime 会把它切成多个 output.delta 投影为 assistant-message。' +
    '真实 Agent Runtime 尚未接入；本段仅为本地产品体验。'
  const chunks: string[] = []
  let total = 0
  let i = 0
  while (total < 2200) {
    const block = `## 段落 ${i + 1}\n\n${paragraph}\n\n`
    chunks.push(block)
    total += block.length
    i += 1
  }
  return chunks
}

/**
 * Demo keyword → scenario. Only applied when no pin and default is normal-stream.
 * Order matters (e.g. 拒绝 before generic paths).
 */
export function resolveScenarioFromKeywords(
  inputText: string,
): FakeScenarioName | null {
  if (inputText.includes('审批') || inputText.includes('批准')) {
    return 'approval-approve'
  }
  if (inputText.includes('拒绝')) return 'approval-reject'
  if (inputText.includes('工作流') || inputText.includes('fixture')) {
    return 'fixture-workflow'
  }
  if (inputText.includes('工具') || inputText.includes('思考')) {
    return 'reasoning-tools-complete'
  }
  if (inputText.includes('澄清') || inputText.includes('补充')) {
    return 'waiting-input'
  }
  if (inputText.includes('长文')) return 'long-content'
  if (inputText.includes('失败') || inputText.includes('重试')) {
    return 'fail-once-retry'
  }
  if (inputText.includes('打开文档') || inputText.includes('open-document')) {
    return 'work-surface-open-document'
  }
  if (inputText.includes('打开浏览器') || inputText.includes('open-browser')) {
    return 'work-surface-open-browser'
  }
  if (inputText.includes('非法路径') || inputText.includes('open-illegal')) {
    return 'work-surface-open-illegal'
  }
  return null
}

/** Spec §7 Fake fixtures: open_requested for document / browser / illegal path. */
export const WORK_SURFACE_OPEN_DOCUMENT_STEPS: readonly ScenarioStreamStep[] = [
  {
    type: 'output.delta',
    payload: { index: 0, text: '将打开文档预览（Runtime 请求）。\n' },
  },
  {
    type: 'output.completed',
    payload: { text: '将打开文档预览（Runtime 请求）。' },
  },
  {
    type: 'work_surface.open_requested',
    payload: {
      kind: 'document',
      resourceKey: 'fixture/notes/plan.txt',
      title: 'plan.txt',
      reason: 'agent',
    },
  },
]

export const WORK_SURFACE_OPEN_BROWSER_STEPS: readonly ScenarioStreamStep[] = [
  {
    type: 'output.delta',
    payload: { index: 0, text: '将打开浏览器预览（Runtime 请求）。\n' },
  },
  {
    type: 'output.completed',
    payload: { text: '将打开浏览器预览（Runtime 请求）。' },
  },
  {
    type: 'work_surface.open_requested',
    payload: {
      kind: 'browser',
      resourceKey: 'https://example.com/',
      title: 'example.com',
      reason: 'agent',
    },
  },
]

export const WORK_SURFACE_OPEN_ILLEGAL_STEPS: readonly ScenarioStreamStep[] = [
  {
    type: 'output.completed',
    payload: { text: '非法 path 不应写入 openTabs。' },
  },
  {
    type: 'work_surface.open_requested',
    payload: {
      kind: 'document',
      resourceKey: '../etc/passwd',
      title: 'bad',
      reason: 'agent',
    },
  },
]

/** Fixed event script for reasoning-tools-complete (s02-class). */
export const REASONING_TOOLS_STEPS: readonly ScenarioStreamStep[] = [
  {
    type: 'reasoning.started',
    payload: { sectionId: 'rs-1', title: '分析需求' },
  },
  {
    type: 'reasoning.delta',
    payload: { sectionId: 'rs-1', text: '先拆解目标与约束…' },
  },
  {
    type: 'reasoning.delta',
    payload: { sectionId: 'rs-1', text: '再选择工具路径。' },
  },
  {
    type: 'reasoning.section_completed',
    payload: { sectionId: 'rs-1', title: '分析需求' },
  },
  {
    type: 'reasoning.completed',
    payload: { sectionId: 'rs-1', summary: '准备调用工具' },
  },
  {
    type: 'plan.updated',
    payload: {
      steps: ['读取文件', '运行检查', '汇总结果'],
      title: '执行计划',
    },
  },
  {
    type: 'tool.called',
    payload: { toolId: 'tool-read', label: '读取 README', name: 'read_file' },
  },
  {
    type: 'tool.progress',
    payload: { toolId: 'tool-read', label: '读取 README', progress: 0.5 },
  },
  {
    type: 'tool.completed',
    payload: {
      toolId: 'tool-read',
      label: '读取 README',
      summary: '已读取 120 行',
    },
  },
  {
    type: 'command.started',
    payload: {
      commandId: 'cmd-lint',
      command: 'pnpm check:workbench',
    },
  },
  {
    type: 'command.output',
    payload: {
      commandId: 'cmd-lint',
      text: 'check:workbench ok\n',
    },
  },
  {
    type: 'command.completed',
    payload: { commandId: 'cmd-lint', exitCode: 0 },
  },
  {
    type: 'file.changed',
    payload: {
      path: 'src/modules/task/projection/project-events.ts',
      summary: '扩展 4D 投影',
      additions: 3,
      deletions: 1,
      diffLines: [
        { type: 'del', text: '  // prior stub', line: 1 },
        { type: 'add', text: '  // 4D projection for file.changed', line: 1 },
        { type: 'add', text: '  // liveStatus + meta', line: 2 },
      ],
    },
  },
  {
    type: 'source.grouped',
    payload: {
      title: '相关源码',
      sources: [{ path: 'fake-runtime.ts' }, { path: 'timeline.tsx' }],
    },
  },
  {
    type: 'output.delta',
    payload: { index: 0, text: '## 结果\n\n' },
  },
  {
    type: 'output.delta',
    payload: {
      index: 1,
      text: '工具与命令均已在 Fake 路径完成（非生产）。',
    },
  },
  {
    type: 'output.completed',
    payload: {
      text: '## 结果\n\n工具与命令均已在 Fake 路径完成（非生产）。',
    },
  },
]

/**
 * Gold Fake workflow: plan → reads → command → file.changed (diff) → output.
 * Keyword: 「工作流」 / 「fixture」.
 */
export const FIXTURE_WORKFLOW_STEPS: readonly ScenarioStreamStep[] = [
  {
    type: 'reasoning.started',
    payload: { sectionId: 'rs-wf', title: '规划工作流' },
  },
  {
    type: 'reasoning.delta',
    payload: { sectionId: 'rs-wf', text: '对齐 capture 金样步骤…' },
  },
  {
    type: 'reasoning.completed',
    payload: { sectionId: 'rs-wf', summary: '开始执行计划' },
  },
  {
    type: 'plan.updated',
    payload: {
      title: '执行计划',
      steps: ['读取 plan.txt', '读取 alpha.txt', 'ls 目录', '写入结果'],
    },
  },
  {
    type: 'tool.called',
    payload: {
      toolId: 'tool-read-plan',
      label: '读取 plan.txt',
      name: 'read_file',
      items: ['fixture/notes/plan.txt'],
    },
  },
  {
    type: 'tool.completed',
    payload: {
      toolId: 'tool-read-plan',
      label: '已读取 plan.txt',
      summary: '3 步计划',
      items: ['fixture/notes/plan.txt'],
    },
  },
  {
    type: 'tool.called',
    payload: {
      toolId: 'tool-read-alpha',
      label: '读取 alpha.txt',
      name: 'read_file',
      items: ['fixture/notes/alpha.txt'],
    },
  },
  {
    type: 'tool.completed',
    payload: {
      toolId: 'tool-read-alpha',
      label: '已读取 alpha.txt',
      summary: '样本文本',
      items: ['fixture/notes/alpha.txt'],
    },
  },
  {
    type: 'command.started',
    payload: {
      commandId: 'cmd-ls',
      command: 'ls fixture/notes',
    },
  },
  {
    type: 'command.output',
    payload: {
      commandId: 'cmd-ls',
      text: 'plan.txt\nalpha.txt\n',
    },
  },
  {
    type: 'command.completed',
    payload: { commandId: 'cmd-ls', exitCode: 0 },
  },
  {
    type: 'file.changed',
    payload: {
      path: 'fixture/notes/workflow-result.md',
      summary: '文件已创建',
      additions: 10,
      deletions: 0,
      diffLines: [
        {
          type: 'add',
          text: '# Synthetic Fixture Workflow Result',
          line: 1,
        },
        { type: 'add', text: '', line: 2 },
        {
          type: 'add',
          text: 'Plan steps completed in Deterministic Fake path.',
          line: 3,
        },
        {
          type: 'add',
          text: 'Sources: plan.txt, alpha.txt, ls fixture/notes',
          line: 4,
        },
        { type: 'add', text: '', line: 5 },
        { type: 'add', text: '## Checklist', line: 6 },
        { type: 'add', text: '- [x] read plan', line: 7 },
        { type: 'add', text: '- [x] read alpha', line: 8 },
        { type: 'add', text: '- [x] list dir', line: 9 },
        { type: 'add', text: '- [x] write result', line: 10 },
      ],
    },
  },
  {
    type: 'output.delta',
    payload: { index: 0, text: '## 工作流结果\n\n' },
  },
  {
    type: 'output.delta',
    payload: {
      index: 1,
      text: '已读取 plan / alpha，运行 ls，并写入 `workflow-result.md`（Fake，非生产）。',
    },
  },
  {
    type: 'output.completed',
    payload: {
      text: '## 工作流结果\n\n已读取 plan / alpha，运行 ls，并写入 `workflow-result.md`（Fake，非生产）。',
    },
  },
]
