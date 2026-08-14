import {
  Bug,
  Hammer,
  Radar,
  RefreshCw,
  Terminal,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LaunchAction } from '../../model/types'

export interface EmptyHubProps {
  actions: LaunchAction[]
  onSelectAction: (action: LaunchAction) => void
}

const ACTION_VISUAL = {
  explore: { Icon: Radar, className: 'text-sky-400' },
  build: { Icon: Hammer, className: 'text-violet-400' },
  review: { Icon: RefreshCw, className: 'text-emerald-400' },
  fix: { Icon: Bug, className: 'text-orange-400' },
} as const

/** New-task hub: greeting + launch cards. Project is chosen on the Composer chip. */
export function EmptyHub({
  actions,
  onSelectAction,
}: EmptyHubProps) {
  return (
    <div
      className='flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10'
      data-slot='empty-hub'
      data-testid='empty-hub'
    >
      <div className='mb-6 flex size-12 items-center justify-center rounded-full border border-border text-muted-foreground'>
        <Terminal className='size-6' aria-hidden />
      </div>
      <h2
        className='max-w-xl text-center text-xl font-medium tracking-tight text-foreground'
        data-testid='empty-hub-title'
      >
        今天帮你做些什么？
      </h2>

      <div
        className='mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'
        data-testid='empty-hub-actions'
      >
        {actions.map((action) => {
          const { Icon, className } = ACTION_VISUAL[action.icon]
          return (
            <Card
              key={action.id}
              role='button'
              tabIndex={0}
              data-testid={`empty-hub-action-${action.id}`}
              className={cn(
                'min-h-[104px] cursor-pointer gap-0 py-4 ring-border transition-colors',
                'hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50'
              )}
              onClick={() => onSelectAction(action)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectAction(action)
                }
              }}
            >
              <CardContent className='flex flex-col items-start gap-3'>
                <Icon className={cn('size-5', className)} aria-hidden />
                <span className='text-sm leading-snug text-foreground'>
                  {action.label}
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
