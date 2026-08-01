import type { ReactNode } from 'react'
import { CircleQuestionMark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type LearnMoreProps = Omit<React.ComponentProps<typeof Popover>, 'children'> & {
  children?: ReactNode
  contentProps?: React.ComponentProps<typeof PopoverContent>
  triggerProps?: React.ComponentProps<typeof PopoverTrigger>
}

export function LearnMore({
  children,
  contentProps,
  triggerProps,
  ...props
}: LearnMoreProps) {
  return (
    <Popover {...props}>
      <PopoverTrigger
        {...triggerProps}
        className={cn('size-5 rounded-full', triggerProps?.className)}
        render={
          <Button variant='outline' size='icon'>
            <span className='sr-only'>Learn more</span>
            <CircleQuestionMark className='size-4 [&>circle]:hidden' />
          </Button>
        }
      />
      <PopoverContent
        side='top'
        align='start'
        {...contentProps}
        className={cn('text-sm text-muted-foreground', contentProps?.className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
