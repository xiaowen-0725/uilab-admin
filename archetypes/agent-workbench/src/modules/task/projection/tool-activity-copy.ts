/**
 * Chinese natural-language copy for tool rows + live status (Kun/Codex-aligned).
 * Pure: no React, no projection state.
 */

export type ToolActivityPhase = 'running' | 'completed' | 'error'

export type ToolActivityKind =
  | 'read'
  | 'write'
  | 'list'
  | 'search'
  | 'command'
  | 'plan'
  | 'skill'
  | 'generic'

const OBJECT_MAX = 48

export interface ToolActivityInput {
  name?: string | null
  label?: string | null
  args?: unknown
  /** Timeline items / children paths when args missing */
  items?: readonly string[] | null
  status: ToolActivityPhase
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function truncateObject(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= OBJECT_MAX) return one
  return `…${one.slice(-(OBJECT_MAX - 1))}`
}

/** Extract path / pattern / command for the activity object phrase. */
export function extractToolObject(input: {
  name?: string | null
  label?: string | null
  args?: unknown
  items?: readonly string[] | null
}): string | undefined {
  const rec = asRecord(input.args)
  if (rec) {
    for (const key of [
      'path',
      'file_path',
      'filePath',
      'filepath',
      'target',
    ] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) return truncateObject(v)
    }
    for (const key of ['pattern', 'query', 'glob'] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) return truncateObject(v)
    }
    const cmd = rec.command
    if (typeof cmd === 'string' && cmd.trim()) return truncateObject(cmd)
  }

  if (input.items?.length) {
    const first = input.items.find((s) => typeof s === 'string' && s.trim())
    if (first) return truncateObject(first)
  }

  const label = input.label?.trim() ?? ''
  // "读取 plan.txt" / "已读取 fixture/notes/plan.txt"
  const fromLabel = label.match(
    /(?:读取|写入|编辑|列出|搜索|执行)\s+(.+)$/,
  )
  if (fromLabel?.[1]) return truncateObject(fromLabel[1])

  // path-like tail
  const pathish = label.match(/([\w./@-]+\.\w{1,12}|\/[\w./@-]+)\s*$/)
  if (pathish?.[1]) return truncateObject(pathish[1])

  return undefined
}

export function classifyToolActivity(
  name?: string | null,
  label?: string | null,
): ToolActivityKind {
  const tool = (name ?? '').trim().toLowerCase()
  const hay = `${tool} ${label ?? ''}`.toLowerCase()
  if (/web_search|搜索网页|search.*web/.test(hay)) return 'search'
  if (
    /grep|glob|find|search_files|grep_files|搜索(?!网页)/.test(hay) ||
    (/\bsearch\b/.test(hay) && !/web/.test(hay))
  ) {
    return 'search'
  }
  if (
    tool === 'read' ||
    tool === 'read_file' ||
    /read_file|读取|workspace_read_skill|read_skill/.test(hay)
  ) {
    return 'read'
  }
  if (
    tool === 'write' ||
    tool === 'edit' ||
    /write_file|edit_file|delete_file|create_file|写入|编辑|删除|\bmkdir\b|\brmdir\b/.test(
      hay,
    )
  ) {
    return 'write'
  }
  if (
    tool === 'ls' ||
    /list_tree|list_files|list_dir|列出/.test(hay)
  ) {
    return 'list'
  }
  if (
    /run_command|bash|shell|exec|command|pnpm|npm|执行命令/.test(hay)
  ) {
    return 'command'
  }
  if (/plan|计划/.test(hay)) return 'plan'
  if (/skill|技能/.test(hay)) return 'skill'
  return 'generic'
}

/** Icon hint for Timeline tool-group meta.toolKind */
export function toolKindHint(kind: ToolActivityKind): string {
  switch (kind) {
    case 'read':
    case 'skill':
      return 'read'
    case 'command':
      return 'command'
    case 'search':
      return 'web_search'
    default:
      return 'generic'
  }
}

function verbPhrase(
  kind: ToolActivityKind,
  status: ToolActivityPhase,
  object: string | undefined,
  name: string,
): string {
  const obj = object ? ` ${object}` : ''
  if (status === 'error') {
    switch (kind) {
      case 'read':
        return object ? `读取失败 ${object}` : '读取失败'
      case 'write':
        return object ? `写入失败 ${object}` : '写入失败'
      case 'list':
        return object ? `列出失败 ${object}` : '列出失败'
      case 'search':
        return object ? `搜索失败 ${object}` : '搜索失败'
      case 'command':
        return object ? `命令失败 ${object}` : '命令执行失败'
      default:
        return object ? `调用失败 ${object}` : '工具失败'
    }
  }

  if (status === 'running') {
    switch (kind) {
      case 'read':
        return object ? `正在读取${obj}` : '正在读取文件…'
      case 'write':
        return object ? `正在写入${obj}` : '正在写入结果…'
      case 'list':
        return object ? `正在列出${obj}` : '正在列出目录…'
      case 'search':
        return object ? `正在搜索${obj}` : '正在搜索…'
      case 'command':
        return object ? `正在执行${obj}` : '正在执行命令…'
      case 'plan':
        return '正在更新计划…'
      case 'skill':
        return object ? `正在读取技能${obj}` : '正在读取技能…'
      default:
        return name ? `正在调用 ${name}` : '正在思考'
    }
  }

  // completed
  switch (kind) {
    case 'read':
      return object ? `已读取${obj}` : '已读取'
    case 'write':
      return object ? `已写入${obj}` : '已写入'
    case 'list':
      return object ? `已列出${obj}` : '已列出'
    case 'search':
      return object ? `已搜索${obj}` : '已搜索'
    case 'command':
      return object ? `已执行${obj}` : '已执行命令'
    case 'plan':
      return '已更新计划'
    case 'skill':
      return object ? `已读取技能${obj}` : '已读取技能'
    default:
      return name ? `已调用 ${name}` : '已完成'
  }
}

/**
 * One-line Chinese activity copy for tool-group title and liveStatus.
 * Preserves already-good Chinese labels when they match phase.
 */
export function formatToolActivityCopy(input: ToolActivityInput): string {
  const label = input.label?.trim() ?? ''
  const name = input.name?.trim() ?? ''

  // Fixture / product copy already natural — keep when phase-aligned.
  if (label && /[\u4e00-\u9fff]/.test(label)) {
    if (input.status === 'running' && /^正在/.test(label)) return label
    if (input.status === 'completed' && /^已/.test(label)) return label
    // "搜索网页" alone → running search phrase
    if (input.status === 'running' && /搜索网页/.test(label)) {
      return '正在搜索网页…'
    }
  }

  const kind = classifyToolActivity(name, label)
  const object = extractToolObject(input)
  return verbPhrase(kind, input.status, object, name || label)
}

/** Live-status line while a tool is in flight (alias of running copy). */
export function liveStatusForToolActivity(input: Omit<ToolActivityInput, 'status'>): string {
  return formatToolActivityCopy({ ...input, status: 'running' })
}
