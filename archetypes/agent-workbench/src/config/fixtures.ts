/**
 * Static Workbench fixtures + capture wiring (no live Runtime).
 * One TaskSeed list derives session seed, nav meta, and surface fixtures.
 */

import {
  DEFAULT_GOLDEN_CAPTURE_ID,
  getEventStreamCapture,
} from '@/config/captures'
import {
  foldCaptureToView,
  type ContextSection,
  type LaunchAction,
  type StreamViewModel,
  type TaskContentMode,
} from '@/modules/task'
import type { WorkbenchSessionSeed } from '@/modules/workbench-session'

export interface NavigatorUtility {
  id: string
  label: string
  /** lucide key resolved in Navigator UI */
  icon: 'git-pull-request' | 'globe' | 'clock' | 'puzzle'
}

export interface ProjectFolder {
  id: string
  name: string
}

/** Navigator-only placement (pinned / folder). Surface mode lives on TaskFixture. */
export interface TaskNavMeta {
  pinned?: boolean
  projectFolderId?: string | null
}

export interface TaskFixture {
  taskId: string
  contentMode: TaskContentMode
  captureId?: string
  /** Optional intermediate fold stop for demos */
  untilEventId?: string
  context: ContextSection[]
}

/** Single task definition — source of truth for seed / nav / surface fixtures. */
interface TaskSeed {
  id: string
  title: string
  subtitle?: string
  pinned?: boolean
  projectFolderId?: string | null
  contentMode: TaskContentMode
  captureId?: string
  untilEventId?: string
  /** Stream context panel tag; empty tasks use emptyContext(). */
  contextTag?: string
}

export const launchActions: LaunchAction[] = [
  {
    id: 'explore',
    label: '探索并理解代码',
    promptStub: '探索并理解当前仓库结构与关键模块。',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    icon: 'explore',
  },
  {
    id: 'build',
    label: '构建新功能、应用或工具',
    promptStub: '在当前项目中构建一个小功能并说明改动点。',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    icon: 'build',
  },
  {
    id: 'review',
    label: '审查代码并提出修改建议',
    promptStub: '审查最近改动并给出修改建议。',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    icon: 'review',
  },
  {
    id: 'fix',
    label: '修复问题和失败',
    promptStub: '定位并修复当前失败用例或类型错误。',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    icon: 'fix',
  },
]

export const navigatorUtilities: NavigatorUtility[] = [
  { id: 'pull-requests', label: '拉取请求', icon: 'git-pull-request' },
  { id: 'sites', label: '站点', icon: 'globe' },
  { id: 'scheduled', label: '已安排', icon: 'clock' },
  { id: 'plugins', label: '插件', icon: 'puzzle' },
]

export const projectFolders: ProjectFolder[] = [
  { id: 'folder-uilab', name: 'ui-components' },
  { id: 'folder-skills', name: 'zhoujw-skills' },
  { id: 'folder-parking', name: 'parking-agent' },
  { id: 'folder-hermes', name: 'ake-hermes-agent' },
]

const TASK_SEEDS: TaskSeed[] = [
  {
    id: 'task-empty',
    title: '新任务',
    subtitle: '开场区',
    contentMode: 'empty',
  },
  {
    id: 'task-a',
    title: '合成工作流回放',
    subtitle: '金样 · 时序回放',
    pinned: true,
    contentMode: 'stream',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    contextTag: 'case-fixture-workflow-replay',
  },
  {
    id: 'task-flychess',
    title: '飞行棋调研 + HTML + 总结',
    subtitle: 'Codex 冻结 · 禁止子智能体',
    pinned: true,
    contentMode: 'stream',
    captureId: 'case-flychess-codex-replay',
    contextTag: 'case-flychess-codex-replay',
  },
  {
    id: 'task-b',
    title: '微信 WebView 音频解锁方案',
    subtitle: 'golden capture 回放',
    pinned: true,
    contentMode: 'stream',
    captureId: 'golden-weixin-audio',
    contextTag: 'golden-weixin-audio',
  },
  {
    id: 'task-c',
    title: '对齐 Agent 定位与后端路线',
    subtitle: 'ui-components',
    projectFolderId: 'folder-uilab',
    contentMode: 'stream',
    captureId: DEFAULT_GOLDEN_CAPTURE_ID,
    contextTag: 'project folder',
  },
  {
    id: 'task-d',
    title: 'parking-agent 实现',
    subtitle: '项目会话',
    projectFolderId: 'folder-parking',
    contentMode: 'empty',
  },
]

export const taskNavMeta: Record<string, TaskNavMeta> = Object.fromEntries(
  TASK_SEEDS.map((task) => [
    task.id,
    {
      pinned: task.pinned,
      projectFolderId: task.projectFolderId,
    } satisfies TaskNavMeta,
  ])
)

export const taskFixtures: Record<string, TaskFixture> = Object.fromEntries(
  TASK_SEEDS.map((task) => [
    task.id,
    {
      taskId: task.id,
      contentMode: task.contentMode,
      captureId: task.captureId,
      untilEventId: task.untilEventId,
      context:
        task.contentMode === 'stream' && task.contextTag
          ? streamContext(task.contextTag)
          : emptyContext(),
    } satisfies TaskFixture,
  ])
)

/**
 * @deprecated Product path no longer seeds phase3 capture tasks.
 * Kept only for capture-harness / fidelity tests that explicitly import it.
 */
export const phase3SessionSeed: WorkbenchSessionSeed = {
  selectedProjectId: 'project-default',
  selectedTaskId: null,
}

/** Capture fixture seeds for test harness only (not product default boot). */
export const captureHarnessTaskSeeds = TASK_SEEDS

export function getTaskFixture(taskId: string): TaskFixture {
  return taskFixtures[taskId] ?? taskFixtures['task-empty']
}

export function getStreamViewForTask(
  taskId: string,
  overrideCaptureId?: string
): StreamViewModel | null {
  const fixture = getTaskFixture(taskId)
  const captureId = overrideCaptureId ?? fixture.captureId
  // overrideCaptureId allows empty-hub card clicks to load a golden stream.
  if (!captureId) return null
  const capture = getEventStreamCapture(captureId)
  return foldCaptureToView(capture, {
    untilEventId: overrideCaptureId ? undefined : fixture.untilEventId,
  })
}

function emptyContext(): ContextSection[] {
  return [
    {
      id: 'env',
      title: '环境',
      items: ['开场区', '无事件流', 'fixture 交互'],
    },
  ]
}

function streamContext(tag: string): ContextSection[] {
  return [
    {
      id: 'env',
      title: '环境',
      items: ['事件流回放', tag, '无 Agent Runtime'],
    },
    {
      id: 'source',
      title: '来源',
      items: [
        tag === 'golden-weixin-audio'
          ? 'config/captures/golden-weixin-audio.json'
          : tag === 'case-technical-audit-replay'
            ? 'config/captures/case-technical-audit-replay.json'
            : 'config/captures/case-fixture-workflow-replay.json',
      ],
    },
  ]
}
