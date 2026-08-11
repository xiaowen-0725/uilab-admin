/**
 * Minimal ToolApproval surface for Workbench ApprovalDock.
 *
 * Full visual source lives in UI Lab (`ui-components/components/agents/tool-approval`).
 * This local module unblocks Runtime path boot when the registry component is not
 * vendored yet. Keep API-compatible with ApprovalDock usage.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ToolApprovalStatus =
  | 'pending'
  | 'approving'
  | 'approved'
  | 'denied'
  | 'running'
  | 'complete'
  | 'error'

export type ToolApprovalParameter = {
  id: string
  label: ReactNode
  value: ReactNode
}

export type ToolApprovalCodeProps = {
  code: string
  language?: string
  className?: string
}

export function ToolApprovalCode({
  code,
  className,
}: ToolApprovalCodeProps) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-foreground',
        className,
      )}
      data-slot='tool-approval-code'
    >
      {code}
    </pre>
  )
}

export type ToolApprovalProps = {
  tool: ReactNode
  title?: ReactNode
  description?: ReactNode
  parameters?: ToolApprovalParameter[]
  status?: ToolApprovalStatus
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onApprove?: () => void
  onAlwaysAllow?: () => void
  onDeny?: () => void
  className?: string
  approveLabel?: ReactNode
  denyLabel?: ReactNode
  detailsLabel?: ReactNode
  statusLabels?: Partial<Record<ToolApprovalStatus, string>>
}

export function ToolApproval({
  tool,
  title = '是否允许执行该工具？',
  description,
  parameters = [],
  status = 'pending',
  className,
  approveLabel = '允许一次',
  denyLabel = '拒绝',
  statusLabels,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  const statusText =
    statusLabels?.[status] ??
    (status === 'pending' ? '需要授权' : status)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border border-border/70 bg-background/95 p-4 shadow-sm',
        className,
      )}
      data-slot='tool-approval'
      data-status={status}
      data-testid='tool-approval'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='text-[12px] font-medium text-muted-foreground'>
            {tool}
          </div>
          <div className='text-[14px] font-semibold text-foreground'>{title}</div>
          {description ? (
            <p className='text-[13px] text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        <span className='shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'>
          {statusText}
        </span>
      </div>

      {parameters.length > 0 ? (
        <div className='space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3'>
          {parameters.map((param) => (
            <div key={param.id} className='space-y-1'>
              <div className='text-[11px] font-medium text-muted-foreground'>
                {param.label}
              </div>
              <div className='text-[13px] text-foreground'>{param.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {status === 'pending' ? (
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <button
            type='button'
            className='inline-flex h-8 items-center rounded-lg border border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted/50'
            data-testid='tool-approval-deny'
            onClick={() => onDeny?.()}
          >
            {denyLabel}
          </button>
          <button
            type='button'
            className='inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90'
            data-testid='tool-approval-approve'
            onClick={() => onApprove?.()}
          >
            {approveLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
