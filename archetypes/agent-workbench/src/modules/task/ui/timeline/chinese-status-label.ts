import type { TimelineItem, TokenUsage } from '../../projection/types'

export function formatUsageHover(usage?: TokenUsage | null): string | undefined {
  if (!usage) return undefined
  const parts: string[] = []
  if (usage.inputTokens != null) parts.push(`输入 ${usage.inputTokens}`)
  if (usage.outputTokens != null) parts.push(`输出 ${usage.outputTokens}`)
  if (parts.length === 0 && usage.totalTokens != null) {
    parts.push(`共 ${usage.totalTokens}`)
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/**
 * Turn chrome label without embedding duration (duration appended once by header).
 *
 * Status wins over title for active runs. Projection may historically stamp title
 * 「已处理」while status is still `running`; in Chinese that past-tense reads as
 * completed — never show 「已处理」until status is completed.
 */
export function chineseStatusLabel(item: TimelineItem): string {
  switch (item.status) {
    case 'queued':
      return '排队中'
    case 'running': {
      if (item.title === '正在思考') return '正在思考'
      if (item.title === '处理中') return '处理中'
      return '正在思考'
    }
    case 'cancelling':
      return '取消中'
    case 'waiting_for_approval':
      return '等待审批'
    case 'waiting_for_input':
      return '等待输入'
    case 'completed':
      return '已处理'
    case 'cancelled':
      return '已取消'
    case 'failed':
      return '失败'
    case 'interrupted':
      return '已中断'
    default:
      break
  }
  if (item.title === '已处理') return '已处理'
  if (item.title && /[\u4e00-\u9fff]/.test(item.title)) return item.title
  return item.title ?? item.status ?? '运行'
}
