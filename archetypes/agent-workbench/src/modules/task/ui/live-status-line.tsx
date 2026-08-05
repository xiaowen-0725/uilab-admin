import { cn } from '@/lib/utils'

export interface LiveStatusLineProps {
  /** Chinese intermediate status; null/empty hides the line. */
  status: string | null | undefined
  className?: string
  /** test id override */
  testId?: string
}

/**
 * Codex-like live status under timeline / above composer:
 * muted text + CSS shimmer sweep; hidden when terminal/null.
 * reduced-motion: static muted text (no animation).
 */
export function LiveStatusLine({
  status,
  className,
  testId = 'live-status-line',
}: LiveStatusLineProps) {
  if (!status) return null
  return (
    <div
      className={cn(
        'flex min-h-6 items-center px-0.5 py-1 text-[13px] leading-5',
        className,
      )}
      data-testid={testId}
      data-slot='live-status-line'
      aria-live='polite'
    >
      <span className='wb-live-status-shimmer'>{status}</span>
    </div>
  )
}
