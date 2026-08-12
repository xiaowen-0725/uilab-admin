/**
 * Codex-style bottom approval dock (replaces Composer while pending).
 * Visual surface: UI Lab `tool-approval`.
 */
import { useEffect } from 'react'
import { Terminal } from 'lucide-react'
import {
  ToolApproval,
  ToolApprovalCode,
  type ToolApprovalStatus,
} from '@/components/agents/tool-approval'
import { cn } from '@/lib/utils'
import type { TimelineItem } from '../../projection/types'

const STATUS_LABELS: Partial<Record<ToolApprovalStatus, string>> = {
  pending: '需要授权',
  approving: '授权中',
  approved: '已允许',
  denied: '已拒绝',
  running: '执行中',
  complete: '已完成',
  error: '失败',
}

export interface PendingApproval {
  requestId: string
  title: string
  body?: string
  toolLabel: string
  toolName: string | null
  command?: string
}

export function findPendingApproval(
  timeline: TimelineItem[] | undefined | null,
): PendingApproval | null {
  if (!timeline?.length) return null
  const item = [...timeline]
    .reverse()
    .find(
      (entry) =>
        entry.category === 'approval-request' && entry.status === 'waiting',
    )
  if (!item) return null

  const requestId = item.id.startsWith('approval-request:')
    ? item.id.slice('approval-request:'.length)
    : item.id
  const body = item.body?.trim() || undefined
  const commandMatch = body?.match(/(?:命令|command)\s*[:：]\s*(.+)$/im)
  const command =
    commandMatch?.[1]?.trim() ||
    (body && body.includes('/') && body.length < 240 ? body : undefined)
  // toolName is projection meta only — never parse model-controlled body text.
  const toolName = item.meta?.toolName?.trim() || null

  return {
    requestId,
    title: item.title ?? '需要审批',
    body,
    toolLabel: '终端',
    toolName,
    command,
  }
}

export interface ApprovalDockProps {
  approval: PendingApproval
  onApprove: (requestId: string) => void | Promise<void>
  onReject: (requestId: string) => void | Promise<void>
  className?: string
}

/** Bottom dock in place of Composer; Escape rejects. */
export function ApprovalDock({
  approval,
  onApprove,
  onReject,
  className,
}: ApprovalDockProps) {
  const { requestId, title, body, toolLabel, command } = approval

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      void onReject(requestId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestId, onReject])

  const parameters = command
    ? [
        {
          id: 'command',
          label: '命令',
          value: <ToolApprovalCode code={command} language='bash' />,
        },
      ]
    : body
      ? [{ id: 'detail', label: '详情', value: body }]
      : []

  return (
    <div
      className={cn('shrink-0 px-3 pb-3 pt-1', className)}
      data-slot='approval-dock'
      data-testid='approval-dock'
      data-request-id={requestId}
      role='region'
      aria-label='工具授权'
    >
      <div className='mx-auto w-full max-w-[var(--content-max-width)]'>
        <ToolApproval
          className={cn(
            'rounded-[20px] border-border/70 bg-[var(--wb-surface-composer)] shadow-[var(--wb-composer-shell-shadow)] backdrop-blur-lg',
            'dark:border-white/10',
          )}
          tool={
            <span className='inline-flex items-center gap-1.5'>
              <Terminal className='size-3.5 opacity-80' aria-hidden />
              {toolLabel}
            </span>
          }
          title={title}
          description={command ? undefined : (body ?? '是否允许执行该敏感操作？')}
          parameters={parameters}
          defaultOpen={parameters.length > 0}
          status='pending'
          approveLabel='允许一次'
          denyLabel={
            <span className='inline-flex items-center gap-1.5'>
              拒绝
              <kbd className='rounded border border-border/80 bg-muted/60 px-1 py-px font-sans text-[10px] text-muted-foreground'>
                Esc
              </kbd>
            </span>
          }
          detailsLabel='查看详情'
          statusLabels={STATUS_LABELS}
          onApprove={() => void onApprove(requestId)}
          onDeny={() => void onReject(requestId)}
        />
      </div>
    </div>
  )
}
