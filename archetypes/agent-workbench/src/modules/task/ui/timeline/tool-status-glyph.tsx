import { ConversationIcon } from '@/components/icons/conversation-icon'
import { cn } from '@/lib/utils'

export function ToolStatusGlyph({
  status,
  className,
}: {
  status?: string
  className?: string
}) {
  const slot = cn('size-4 shrink-0', className)
  if (status === 'running' || status === 'streaming') {
    return (
      <ConversationIcon
        name='refresh'
        className={cn(slot, 'animate-spin motion-reduce:animate-none opacity-80')}
        data-slot='tool-status'
        data-status='running'
      />
    )
  }
  if (
    status === 'completed' ||
    status === 'approved' ||
    status === 'provided'
  ) {
    return (
      <ConversationIcon
        name='check'
        className={cn(slot, 'opacity-70')}
        data-slot='tool-status'
        data-status='completed'
      />
    )
  }
  if (status === 'failed' || status === 'error' || status === 'rejected') {
    return (
      <ConversationIcon
        name='close'
        className={cn(slot, 'text-destructive')}
        data-slot='tool-status'
        data-status='failed'
      />
    )
  }
  return <span className={slot} aria-hidden data-slot='tool-status' />
}
