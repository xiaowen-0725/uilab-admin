import type { ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/utils'

/** Conversation chrome marks. Drawn at 16px. */
export type ConversationIconName =
  | 'assistant'
  | 'terminal'
  | 'edit'
  | 'check'
  | 'chevron-up'
  | 'search'
  | 'folder'
  | 'refresh'
  | 'link'
  | 'list-controls'
  | 'library'
  | 'paperclip'
  | 'file'
  | 'arrow-up-right'
  | 'project'
  | 'more'
  | 'feather-sparkle'
  | 'close'
  | 'alert'

const MARKS: Record<ConversationIconName, ReactNode> = {
  assistant: (
    <>
      <path d='M8 5V3m8 2V3' />
      <rect x='4' y='5' width='16' height='17' rx='4' />
      <circle cx='12' cy='11.5' r='2.4' />
      <path d='M7.8 18c.6-2.5 2.1-3.8 4.2-3.8s3.6 1.3 4.2 3.8' />
    </>
  ),
  terminal: (
    <>
      <rect x='3' y='3' width='18' height='18' rx='4' />
      <path d='m7 8 3 3-3 3m6 1h4' />
    </>
  ),
  edit: (
    <>
      <path d='m4 16-.8 4 4-.8L19 7.4a2.4 2.4 0 0 0-3.4-3.4L4 16Z' />
      <path d='m13.8 5.8 4.4 4.4M4 21h14' />
    </>
  ),
  check: <path d='m4 12 5 5L20 6' />,
  'chevron-up': <path d='m5.5 15.5 6.5-7 6.5 7' />,
  search: (
    <>
      <circle cx='10.5' cy='10.5' r='7.5' />
      <path d='m16 16 5 5' />
    </>
  ),
  folder: (
    <path d='M3 8V7a3 3 0 0 1 3-3h4l2.2 2H18a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8Z' />
  ),
  refresh: (
    <>
      <path d='M20 6v5h-5' />
      <path d='M20 11a8.5 8.5 0 1 1-2.2-5.7L20 7' />
    </>
  ),
  link: (
    <>
      <path d='m13.5 10.5-3 3' />
      <path d='M8.8 16.2 7 18a4.2 4.2 0 0 1-6-6l3-3a4.2 4.2 0 0 1 6 0' />
      <path d='m15.2 7.8 1.8-1.8a4.2 4.2 0 1 1 6 6l-3 3a4.2 4.2 0 0 1-6 0' />
    </>
  ),
  'list-controls': (
    <>
      <circle cx='5' cy='7' r='2' />
      <circle cx='5' cy='17' r='2' />
      <path d='M10 7h10M10 17h10' />
    </>
  ),
  library: (
    <>
      <path d='M12 7c-1.7-2-4.3-3-7-2.5A2.5 2.5 0 0 0 3 7v9.8a2.5 2.5 0 0 0 3 2.5c2.5-.5 4.5.2 6 1.7V7Z' />
      <path d='M12 7c1.7-2 4.3-3 7-2.5A2.5 2.5 0 0 1 21 7v9.8a2.5 2.5 0 0 1-3 2.5c-2.5-.5-4.5.2-6 1.7' />
    </>
  ),
  paperclip: (
    <path d='m21.2 11.8-8.6 8.6a6 6 0 0 1-8.5-8.5l8.2-8.2A4.3 4.3 0 0 1 18.4 9l-8.3 8.3a2.2 2.2 0 1 1-3.1-3.1l7.7-7.7' />
  ),
  file: (
    <>
      <path d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z' />
      <path d='M14 3v6h6' />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d='M7 17 17 7' />
      <path d='M8 7h9v9' />
    </>
  ),
  project: (
    <>
      <circle cx='5' cy='12' r='2.5' />
      <circle cx='14' cy='5' r='2.5' />
      <circle cx='17' cy='18' r='2.5' />
      <path d='m7 10.4 4.9-3.8M16.2 7.2c2.2 1.4 3.2 3.5 3 6.1M14.5 19.8c-2.7 1.2-5.7.7-7.7-1.1' />
    </>
  ),
  more: (
    <>
      <rect x='3' y='3' width='6' height='6' rx='2' />
      <path d='M16 3v6m-3-3h6' />
      <path d='m6 14-3.5 6h7L6 14Z' />
      <circle cx='16.5' cy='17.5' r='3.5' />
    </>
  ),
  'feather-sparkle': (
    <>
      <path d='M8 21c0-7 3.2-13.4 12.8-17-.1 5.2-2.5 9.4-7.5 11.8-1.5.7-3.1 1.1-4.8 1.2' />
      <path d='M8 21c1.7-5 5-8.7 9.7-11M12.5 14H17m-1.5-4H20M4 2.5v6M1 5.5h6' />
    </>
  ),
  close: (
    <>
      <path d='M6 6l12 12' />
      <path d='M18 6L6 18' />
    </>
  ),
  alert: (
    <>
      <path d='M12 4.8 3.2 20h17.6L12 4.8Z' />
      <path d='M12 10v5M12 17.5v.5' />
    </>
  ),
}

export type ConversationIconProps = SVGProps<SVGSVGElement> & {
  name: ConversationIconName
}

export function ConversationIcon({
  name,
  className,
  ...props
}: ConversationIconProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={2}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
      focusable='false'
      className={cn('size-4 shrink-0', className)}
      {...props}
    >
      {MARKS[name]}
    </svg>
  )
}

export function ConversationChevron({
  open = false,
  className,
  ...props
}: Omit<ConversationIconProps, 'name'> & { open?: boolean }) {
  return (
    <ConversationIcon
      name='chevron-up'
      className={cn(
        'origin-center transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
        open ? 'rotate-180' : 'rotate-90',
        className,
      )}
      {...props}
    />
  )
}

/** Quiet sentence trigger: no hover fill, text brightens, chevron is opt-in. */
export function conversationSentenceClassName(className?: string): string {
  return cn(
    'group inline-flex max-w-full items-center self-start bg-transparent text-left shadow-none',
    'text-black/50 transition-colors duration-[var(--tl-motion-fast,120ms)] ease-[var(--tl-ease-standard,cubic-bezier(0.4,0,0.2,1))]',
    'hover:bg-transparent hover:text-black focus-visible:text-black',
    'dark:text-white/50 dark:hover:text-white dark:focus-visible:text-white',
    className,
  )
}

export function conversationSentenceChevronClassName(open: boolean): string {
  if (open) {
    return 'size-4 shrink-0 opacity-70 transition-opacity duration-[var(--tl-motion-fast,120ms)] ease-[var(--tl-ease-standard,cubic-bezier(0.4,0,0.2,1))]'
  }
  return 'size-4 shrink-0 opacity-0 transition-opacity duration-[var(--tl-motion-fast,120ms)] ease-[var(--tl-ease-standard,cubic-bezier(0.4,0,0.2,1))] group-hover:opacity-70 group-focus-visible:opacity-70'
}
