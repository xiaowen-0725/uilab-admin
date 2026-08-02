import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Icon-only toolbar control: Button + Tooltip + native title (tests / hover). */
export function ToolbarIconButton({
  testId,
  pressed,
  label,
  onClick,
  children,
}: {
  testId?: string
  pressed?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon'
            data-testid={testId}
            aria-pressed={pressed}
            aria-label={label}
            title={label}
            className={cn(pressed && 'bg-muted')}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  )
}
