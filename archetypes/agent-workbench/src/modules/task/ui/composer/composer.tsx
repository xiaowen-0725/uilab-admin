import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowUp,
  ChevronDown,
  Folder,
  GitBranch,
  HardDrive,
  Mic,
  Plus,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface ComposerProps {
  /** Optional notice shown when the user attempts submit (local only). */
  disabledReason?: string
  /** Context chip — project / workspace name (fixture). */
  projectLabel?: string
  /** Context chip — environment (fixture default 本地). */
  environmentLabel?: string
  /** Context chip — branch (fixture). */
  branchLabel?: string
  /** Model label shown in toolbar (fixture). */
  modelLabel?: string
}

/**
 * Dock composer — shadcn Textarea + Button; local draft only (no Agent Runtime).
 */
export function Composer({
  disabledReason = '静态 fixture：不会调用 Agent Runtime',
  projectLabel = 'app',
  environmentLabel = '本地',
  branchLabel = 'main',
  modelLabel = '5.6 Sol 极高',
}: ComposerProps) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSubmit = text.trim().length > 0

  // Cap growth when field-sizing-content is unavailable; keep dock height bounded.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const submitLocal = useCallback(() => {
    if (!text.trim()) return
    setNotice(disabledReason)
  }, [disabledReason, text])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        submitLocal()
      }
    },
    [submitLocal]
  )

  const chips = [
    {
      testId: 'composer-chip-project',
      label: projectLabel,
      icon: <Folder className='size-3.5' aria-hidden />,
    },
    {
      testId: 'composer-chip-env',
      label: environmentLabel,
      icon: <HardDrive className='size-3.5' aria-hidden />,
    },
    {
      testId: 'composer-chip-branch',
      label: branchLabel,
      icon: <GitBranch className='size-3.5' aria-hidden />,
    },
  ] as const

  return (
    <div
      className='pointer-events-none sticky bottom-0 z-10 shrink-0 px-4 pb-4 pt-2'
      data-slot='composer'
      data-testid='composer'
    >
      <div className='pointer-events-auto mx-auto w-full max-w-[var(--content-max-width)]'>
        <div
          className='-mb-5 flex items-center gap-1 overflow-x-auto rounded-t-2xl bg-muted/80 px-2 pt-2 pb-7 text-[13px] text-muted-foreground'
          data-testid='composer-context-bar'
        >
          {chips.map((chip) => (
            <ComposerChip
              key={chip.testId}
              icon={chip.icon}
              testId={chip.testId}
            >
              {chip.label}
            </ComposerChip>
          ))}
        </div>

        <div
          className='relative z-10 flex flex-col rounded-[25px] border border-border/60 bg-card/95 shadow-[0_0_0_0.5px_color-mix(in_oklch,var(--foreground)_8%,transparent),0_8px_28px_color-mix(in_oklch,var(--foreground)_10%,transparent)] backdrop-blur-lg dark:bg-[#1a1a1a]/95'
          data-testid='composer-shell'
        >
          <div className='max-h-[25dvh] overflow-y-auto px-4 pt-3.5 pb-1'>
            <label className='sr-only' htmlFor='workbench-composer-input'>
              编写消息
            </label>
            <Textarea
              ref={textareaRef}
              id='workbench-composer-input'
              data-testid='composer-input'
              rows={1}
              className={cn(
                'min-h-[44px] max-h-40 resize-none rounded-none border-none bg-transparent p-0 text-sm leading-5 shadow-none',
                'focus-visible:border-transparent focus-visible:ring-0 md:text-sm',
                'dark:bg-transparent'
              )}
              placeholder='随心输入'
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (notice) setNotice(null)
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <div className='flex items-center gap-1 px-2 pb-2'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              data-testid='composer-add'
              className='rounded-full text-muted-foreground'
              aria-label='添加附件'
              onClick={() =>
                setNotice('添加附件为静态展示：未接入 Runtime')
              }
            >
              <Plus aria-hidden />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              data-testid='composer-access'
              className='h-7 rounded-full px-2 text-[13px] text-orange-500 hover:bg-orange-500/10 hover:text-orange-500'
              title='访问级别（静态 fixture）'
              onClick={() =>
                setNotice('访问级别为静态展示：完全访问（未接入 Runtime）')
              }
            >
              <ShieldAlert data-icon='inline-start' aria-hidden />
              完全访问
            </Button>

            <div className='ms-auto flex items-center gap-0.5'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                data-testid='composer-model'
                className='h-7 rounded-full px-2 text-[13px] text-muted-foreground'
                title='模型（静态 fixture）'
                onClick={() =>
                  setNotice('模型选择为静态展示：未接入 Runtime')
                }
              >
                <span className='text-violet-500 dark:text-violet-400'>
                  {modelLabel}
                </span>
                <ChevronDown data-icon='inline-end' aria-hidden />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                data-testid='composer-mic'
                className='rounded-full text-muted-foreground'
                aria-label='语音输入'
                onClick={() =>
                  setNotice('语音输入为静态展示：未接入 Runtime')
                }
              >
                <Mic aria-hidden />
              </Button>
              <Button
                type='button'
                size='icon-sm'
                data-testid='composer-submit'
                aria-label='发送'
                aria-describedby={noticeId}
                disabled={!canSubmit}
                className={cn(
                  'rounded-full',
                  !canSubmit &&
                    'disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100'
                )}
                onClick={submitLocal}
              >
                <ArrowUp aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        <p
          id={noticeId}
          className='mt-1.5 min-h-4 px-1 text-center text-[11px] text-muted-foreground'
          data-testid='composer-notice'
          role='status'
          aria-live='polite'
        >
          {notice ?? ''}
        </p>
      </div>
    </div>
  )
}

function ComposerChip({
  icon,
  children,
  testId,
}: {
  icon: ReactNode
  children: ReactNode
  testId: string
}) {
  return (
    <span
      data-testid={testId}
      className='flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[13px] text-muted-foreground'
    >
      <span className='flex size-4 items-center justify-center'>{icon}</span>
      <span className='max-w-[9rem] truncate'>{children}</span>
    </span>
  )
}
