import { BugAntIcon as Bug, WrenchScrewdriverIcon as Hammer, SignalIcon as Radar, ArrowPathIcon as RefreshCw } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'
import type { LaunchAction } from '../../model/types'

export interface EmptyHubProps {
  actions: LaunchAction[]
  onSelectAction: (action: LaunchAction) => void
  /** Centered Composer; omitted only in isolated tests. */
  composer?: ReactNode
}

const ACTION_ICON = {
  explore: Radar,
  build: Hammer,
  review: RefreshCw,
  fix: Bug,
} as const

/** New-task hub: greeting + launch capsules + composer. Project is chosen on the Composer chip. */
export function EmptyHub({
  actions,
  onSelectAction,
  composer,
}: EmptyHubProps) {
  return (
    <div
      className='flex min-h-0 flex-1 flex-col overflow-y-auto'
      data-slot='empty-hub'
      data-testid='empty-hub'
    >
      <div className='flex min-h-full flex-1 flex-col items-center justify-center px-6 py-10'>
        <h2
          className='max-w-3xl text-center text-[32px] leading-10 font-bold tracking-tight text-foreground'
          data-testid='empty-hub-title'
        >
          今天帮你做些什么？
        </h2>

        <div className='mt-8 flex w-full max-w-[var(--content-max-width)] flex-col'>
          <div
            className='mb-4 flex flex-wrap items-center gap-2'
            data-testid='empty-hub-actions'
          >
            {actions.map((action) => {
              const Icon = ACTION_ICON[action.icon]
              return (
                <Button
                  key={action.id}
                  type='button'
                  variant='outline'
                  data-testid={`empty-hub-action-${action.id}`}
                  className='rounded-full font-normal text-muted-foreground'
                  onClick={() => onSelectAction(action)}
                >
                  <Icon aria-hidden />
                  {action.label}
                </Button>
              )
            })}
          </div>

          {composer ? <div>{composer}</div> : null}
        </div>
      </div>
    </div>
  )
}
