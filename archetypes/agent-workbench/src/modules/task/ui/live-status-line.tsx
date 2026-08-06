import { cn } from '@/lib/utils'

export interface LiveStatusLineProps {
  /** Chinese intermediate status; null/empty hides the line. */
  status: string | null | undefined
  className?: string
  /** test id override */
  testId?: string
  /**
   * When true, static muted text only (no shimmer). Prefer for process-fold
   * bootstrap so motion restraint holds next to tool rows.
   */
  muted?: boolean
}

/**
 * Codex-like live status (bootstrap「正在思考」).
 * Default: shimmer sweep; pass muted for static text.
 * reduced-motion: CSS forces static muted (see .wb-live-status-shimmer).
 */
export function LiveStatusLine({
  status,
  className,
  testId = 'live-status-line',
  muted = false,
}: LiveStatusLineProps) {
  if (!status) return null
  return (
    <div
      className={cn(
        'flex min-h-6 items-center px-0.5 py-1 text-[13px] leading-5',
        muted ? 'text-muted-foreground' : null,
        className,
      )}
      data-testid={testId}
      data-slot='live-status-line'
      aria-live='polite'
    >
      {muted ? (
        <span>{status}</span>
      ) : (
        <span className='wb-live-status-shimmer'>{status}</span>
      )}
    </div>
  )
}
