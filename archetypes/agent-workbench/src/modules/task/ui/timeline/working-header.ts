import type { WorkingEntry } from './derive-timeline-view'

function isProcessAside(item: { category: string }): boolean {
  return item.category === 'assistant-message'
}

export function countProcessItems(entries: readonly WorkingEntry[]): number {
  return entries.reduce((count, entry) => {
    if (entry.kind === 'activity-group') return count + entry.items.length
    if (isProcessAside(entry.item)) return count
    return count + 1
  }, 0)
}

export function workingOutcomeLabel(
  status: string | undefined,
): string | undefined {
  switch (status) {
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'interrupted':
      return '已中断'
    default:
      return undefined
  }
}

export function workingChromeStatus(
  running: boolean,
  terminalStatus: string | undefined,
): string {
  if (terminalStatus === 'cancelling') return 'cancelling'
  if (running) return 'running'
  return terminalStatus ?? 'completed'
}

export type WorkingHeaderInput = {
  running: boolean
  durationLabel?: string | null
  outcomeLabel?: string | null
}

function withDuration(label: string, durationLabel?: string | null): string {
  if (!durationLabel) return label
  return `${label}\u00A0${durationLabel}`
}

export function formatWorkingHeader(input: WorkingHeaderInput): string {
  if (input.running) {
    return withDuration(input.outcomeLabel ?? '正在处理', input.durationLabel)
  }
  if (input.outcomeLabel) {
    return withDuration(input.outcomeLabel, input.durationLabel)
  }
  return withDuration('已完成', input.durationLabel)
}
