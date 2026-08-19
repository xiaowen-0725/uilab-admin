/**
 * Built-in zero-job example Boards (spec §9.5).
 * Installed as ordinary user rows — editable, deletable, never upgraded in place.
 */

import type {
  BoardPlacement,
  BoardRecord,
  BoardWidgetRecord,
} from '../model/types'
import {
  DAILY_BRIEF_CHART_HTML,
  DAILY_BRIEF_FORM_HTML,
  DAILY_BRIEF_STAT_HTML,
  GETTING_STARTED_COUNTER_HTML,
  GETTING_STARTED_GUIDE_HTML,
  GETTING_STARTED_RESIZE_HTML,
  GETTING_STARTED_THEME_HTML,
  GETTING_STARTED_TODO_HTML,
} from './widget-html'

export const EXAMPLE_DATA_HINT = '示例数据 · 未绑定取数作业'
export const EXAMPLE_DATA_NUDGE = '想让它每天自动更新？在对话里说一声'

export interface ExampleWidgetSpec {
  id: string
  title: string
  html: string
  placement: Omit<BoardPlacement, 'widgetId' | 'mountId'>
  span: BoardWidgetRecord['span']
  latestData?: unknown
}

export interface ExamplePreset {
  id: string
  version: number
  boardId: string
  title: string
  purpose: string
  widgets: readonly ExampleWidgetSpec[]
}

const WIDE = {
  min: { w: 4, h: 3 },
  default: { w: 6, h: 4 },
  max: { w: 12, h: 8 },
} as const

const HALF = {
  min: { w: 3, h: 3 },
  default: { w: 6, h: 4 },
  max: { w: 8, h: 8 },
} as const

const NARROW = {
  min: { w: 3, h: 3 },
  default: { w: 4, h: 5 },
  max: { w: 6, h: 8 },
} as const

const GETTING_STARTED_PRESET: ExamplePreset = {
  id: 'getting-started',
  version: 1,
  boardId: 'example:getting-started',
  title: '上手指引',
  purpose: '演示拖拽、本地交互、saveInput、主题跟随，以及如何用对话创建小组件。',
  widgets: [
    {
      id: 'example:getting-started:resize',
      title: '拖拽与尺寸',
      html: GETTING_STARTED_RESIZE_HTML,
      placement: { x: 0, y: 0, w: 6, h: 4 },
      span: HALF,
    },
    {
      id: 'example:getting-started:counter',
      title: '点击计数',
      html: GETTING_STARTED_COUNTER_HTML,
      placement: { x: 6, y: 0, w: 6, h: 4 },
      span: HALF,
    },
    {
      id: 'example:getting-started:todo',
      title: '待办清单',
      html: GETTING_STARTED_TODO_HTML,
      placement: { x: 0, y: 4, w: 6, h: 5 },
      span: HALF,
    },
    {
      id: 'example:getting-started:theme',
      title: '主题跟随',
      html: GETTING_STARTED_THEME_HTML,
      placement: { x: 6, y: 4, w: 6, h: 5 },
      span: HALF,
    },
    {
      id: 'example:getting-started:guide',
      title: '用对话创建',
      html: GETTING_STARTED_GUIDE_HTML,
      placement: { x: 0, y: 9, w: 12, h: 4 },
      span: WIDE,
    },
  ],
}

const DAILY_BRIEF_PRESET: ExamplePreset = {
  id: 'daily-brief',
  version: 1,
  boardId: 'example:daily-brief',
  title: '示例：每日速递',
  purpose: '用 preset 数据来源展示图表、计数和表单，不绑定取数作业。',
  widgets: [
    {
      id: 'example:daily-brief:chart',
      title: '本周访问',
      html: DAILY_BRIEF_CHART_HTML,
      placement: { x: 0, y: 0, w: 8, h: 5 },
      span: WIDE,
      latestData: { points: [12, 19, 15, 22, 18, 25, 21], unit: '次' },
    },
    {
      id: 'example:daily-brief:stat',
      title: '未读消息',
      html: DAILY_BRIEF_STAT_HTML,
      placement: { x: 8, y: 0, w: 4, h: 5 },
      span: NARROW,
      latestData: { value: 128, label: '未读消息', delta: 12 },
    },
    {
      id: 'example:daily-brief:form',
      title: '今日摘要',
      html: DAILY_BRIEF_FORM_HTML,
      placement: { x: 0, y: 5, w: 12, h: 5 },
      span: WIDE,
      latestData: {
        headline: '周三速递',
        items: ['汇率回看 7.12', '待办 3 件到期'],
      },
    },
  ],
}

export const EXAMPLE_PRESETS: readonly ExamplePreset[] = [
  GETTING_STARTED_PRESET,
  DAILY_BRIEF_PRESET,
]

export function listExampleWidgets(): readonly {
  presetId: string
  widgetId: string
  title: string
  html: string
}[] {
  return EXAMPLE_PRESETS.flatMap((preset) =>
    preset.widgets.map((widget) => ({
      presetId: preset.id,
      widgetId: widget.id,
      title: widget.title,
      html: widget.html,
    })),
  )
}

export function buildExampleBoard(
  preset: ExamplePreset,
  now: string,
): BoardRecord {
  return {
    id: preset.boardId,
    title: preset.title,
    purpose: preset.purpose,
    isExample: true,
    presetId: preset.id,
    presetVersion: preset.version,
    placements: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function buildExampleWidget(
  spec: ExampleWidgetSpec,
  now: string,
): BoardWidgetRecord {
  const widget: BoardWidgetRecord = {
    id: spec.id,
    title: spec.title,
    html: spec.html,
    span: spec.span,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  }
  if (spec.latestData !== undefined) {
    widget.latestData = spec.latestData
    widget.latestDataAt = now
  }
  return widget
}
