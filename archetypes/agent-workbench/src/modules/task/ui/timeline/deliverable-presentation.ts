/**
 * Turn deliverable presentation policy (card + pane auto-open).
 * Independent of Work Surface format-router so Task stays free of that module.
 */

import {
  INTERACTIVE_ARTIFACT_KIND,
  isInteractiveArtifactKind,
} from '../../model/interactive-artifact'
import type { TurnStatus } from '../../model/lifecycle'
import type { DeliverableRef } from '../../projection/types'

const PREVIEW_EXT = new Set([
  'md',
  'mdx',
  'markdown',
  'html',
  'htm',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'docx',
  'xlsx',
  'txt',
])

const CODE_OR_TEXT_EXT = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  'sql',
  'sh',
  'bash',
  'zsh',
  'json',
  'yaml',
  'yml',
  'xml',
  'toml',
  'csv',
  'tsv',
  'log',
])

const LEGACY_UNSUPPORTED = new Set(['doc', 'xls'])

export type DeliverableFamily = 'preview' | 'source' | 'unsupported'

export function deliverableBasename(path: string): string {
  return path.split('/').pop() || path
}

export function deliverableExtension(path: string): string {
  const name = deliverableBasename(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function classifyDeliverable(path: string): DeliverableFamily {
  const ext = deliverableExtension(path)
  if (!ext || LEGACY_UNSUPPORTED.has(ext)) return 'unsupported'
  if (PREVIEW_EXT.has(ext)) return 'preview'
  if (CODE_OR_TEXT_EXT.has(ext)) return 'source'
  return 'unsupported'
}

export function isDeletedDeliverable(item: DeliverableRef): boolean {
  return item.changeKind === 'deleted'
}

export function isInteractiveDeliverable(item: DeliverableRef): boolean {
  return isInteractiveArtifactKind(item.kind)
}

export function deliverableCoverageKey(item: DeliverableRef): string | undefined {
  const raw = isInteractiveDeliverable(item) ? item.id : item.path
  const key = raw?.trim()
  return key || undefined
}

export function deliverableCoverageKeys(
  items: readonly DeliverableRef[] | undefined,
): string[] {
  if (!items) return []
  const keys: string[] = []
  for (const item of items) {
    const key = deliverableCoverageKey(item)
    if (key) keys.push(key)
  }
  return keys
}

export function isPreviewableDeliverable(item: DeliverableRef): boolean {
  if (isDeletedDeliverable(item) || isInteractiveDeliverable(item)) return false
  if (!item.path) return false
  return classifyDeliverable(item.path) === 'preview'
}

export function isOpenableDeliverable(item: DeliverableRef): boolean {
  if (isDeletedDeliverable(item)) return false
  if (isInteractiveDeliverable(item)) return Boolean(item.id?.trim())
  if (!item.path) return false
  return classifyDeliverable(item.path) !== 'unsupported'
}

/** Last preview-whitelist file in turn order — featured card and auto-open target. */
export function featuredDeliverable(
  items: readonly DeliverableRef[],
): DeliverableRef | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item && isPreviewableDeliverable(item)) return item
  }
  return null
}

export function visibleDeliverableCards(
  items: readonly DeliverableRef[],
  featured: DeliverableRef | null,
): DeliverableRef[] {
  const interactive = items.filter(isInteractiveDeliverable)
  if (featured) return [...interactive, featured]
  return interactive
}

export function shouldShowAllArtifactsLink(
  items: readonly DeliverableRef[],
  featured: DeliverableRef | null,
): boolean {
  if (items.length === 0) return false
  return items.length > visibleDeliverableCards(items, featured).length
}

export function deliverablePlainPaths(
  items: readonly DeliverableRef[],
): string[] {
  const paths: string[] = []
  for (const item of items) {
    if (!isInteractiveDeliverable(item) && item.path) paths.push(item.path)
  }
  return paths
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

export function pathMatchesDeliverable(
  path: string | undefined,
  deliverablePaths: readonly string[],
): boolean {
  if (!path || deliverablePaths.length === 0) return false
  const needle = normalizePath(path)
  if (!needle) return false
  const needleBase = deliverableBasename(needle)
  return deliverablePaths.some((raw) => {
    const hay = normalizePath(raw)
    if (!hay) return false
    if (needle === hay) return true
    if (needle.endsWith(`/${hay}`) || hay.endsWith(`/${needle}`)) return true
    return deliverableBasename(hay) === needleBase
  })
}

export function deliverableBadgeLabel(path: string): string {
  const ext = deliverableExtension(path)
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'M'
  if (!ext) return 'FILE'
  return ext.toUpperCase().slice(0, 4)
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

export function deliverableMetaLabel(item: DeliverableRef): string {
  if (isInteractiveDeliverable(item)) return '交互产物'
  const ext = deliverableExtension(item.path ?? '')
  const badge = ext ? ext.toUpperCase() : 'FILE'
  if (item.changeKind === 'deleted') return `已删除 · ${badge}`
  if (item.kind === 'image' || IMAGE_EXT.has(ext)) return `图片 · ${badge}`
  if (ext === 'pdf') return '文档 · PDF'
  if (ext === 'html' || ext === 'htm') return '文档 · HTML'
  if (ext === 'docx') return '文档 · DOCX'
  if (ext === 'xlsx') return '表格 · XLSX'
  if (item.path && classifyDeliverable(item.path) === 'source') {
    return `源码 · ${badge}`
  }
  return `文档 · ${badge}`
}

export function deliverableTitle(item: DeliverableRef): string {
  if (isInteractiveDeliverable(item)) {
    return item.title?.trim() || item.id || '交互产物'
  }
  if (item.title && item.title !== item.path) return item.title
  return deliverableBasename(item.path ?? '')
}

export function deliverableOpenRef(item: DeliverableRef): {
  kind?: string
  path?: string
  label: string
} | null {
  if (!isOpenableDeliverable(item)) return null
  if (isInteractiveDeliverable(item) && item.id) {
    return {
      kind: INTERACTIVE_ARTIFACT_KIND,
      path: item.id,
      label: deliverableTitle(item),
    }
  }
  if (!item.path) return null
  return {
    path: item.path,
    label: deliverableBasename(item.path),
  }
}

export function isNonTerminalTurnStatus(status: TurnStatus | null): boolean {
  if (!status) return false
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting_for_approval' ||
    status === 'waiting_for_input' ||
    status === 'cancelling'
  )
}

export function lastCompletedTurnId(input: {
  turnStatus: TurnStatus | null
  activeTurnId: string | null
  timeline: ReadonlyArray<{
    category: string
    status?: string
    turnId?: string
  }>
}): string | null {
  for (let i = input.timeline.length - 1; i >= 0; i -= 1) {
    const item = input.timeline[i]
    if (
      item?.category === 'turn-terminal' &&
      item.status === 'completed' &&
      item.turnId
    ) {
      return item.turnId
    }
  }
  if (input.turnStatus === 'completed') return input.activeTurnId
  return null
}

export function deliverableCompletionKey(
  taskId: string,
  turnId: string,
): string {
  return `${taskId}:${turnId}`
}

export function shouldAutoOpenDeliverablePane(input: {
  completionKey: string | null
  featuredPath: string | null
  observedActive: boolean
  alreadyOpened: boolean
  dismissed: boolean
}): boolean {
  if (!input.completionKey || !input.featuredPath) return false
  if (!input.observedActive) return false
  if (input.alreadyOpened || input.dismissed) return false
  return true
}

/** Drawer motion only when the pane is currently closed. Tab switch stays instant. */
export function shouldRequestPaneOpenMotion(
  didOpenTab: boolean,
  paneAlreadyVisible: boolean,
): boolean {
  return didOpenTab && !paneAlreadyVisible
}
