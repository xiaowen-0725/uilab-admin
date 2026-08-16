import { Check, Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { QuestionAnswer } from '../../protocol/question-answer'
import { formatQuestionAnswerLabel } from '../../protocol/question-answer'
import type { TimelineItem } from '../../projection/types'

export type QuestionRespondHandler = (
  requestId: string,
  answer: QuestionAnswer,
) => void | Promise<unknown>

export interface QuestionCardProps {
  item: TimelineItem
  requestId: string
  onRespond?: QuestionRespondHandler
}

function QuestionCardFrame({
  item,
  requestId,
  className,
  children,
}: {
  item: TimelineItem
  requestId: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'tl-prose max-w-[46rem] rounded-lg border bg-muted/40',
        className,
      )}
      data-kind='input-request'
      data-testid={`timeline-item-${item.id}`}
      data-category='input-request'
      data-status={item.status}
      data-request-id={requestId}
    >
      {children}
    </div>
  )
}

export function QuestionCard({
  item,
  requestId,
  onRespond,
}: QuestionCardProps) {
  const question = item.meta?.question
  const answered = item.status === 'provided' || Boolean(item.meta?.answer)
  const allowMultiple = question?.allowMultiple === true
  const options = question?.options ?? []
  const [selected, setSelected] = useState<string[]>([])
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')

  if (!question) return null

  if (answered) {
    const answerLabel = item.meta?.answer
      ? formatQuestionAnswerLabel(item.meta.answer, options)
      : '已提供'
    return (
      <QuestionCardFrame item={item} requestId={requestId} className='px-4 py-3'>
        <p className='text-muted-foreground'>
          {question.question}
        </p>
        <p className='mt-1 font-medium'>{answerLabel}</p>
      </QuestionCardFrame>
    )
  }

  function respond(answer: QuestionAnswer): void {
    void onRespond?.(requestId, answer)
  }

  function toggleOption(id: string): void {
    if (!allowMultiple) {
      respond({ kind: 'options', selectedOptionIds: [id] })
      return
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    )
  }

  const otherTrimmed = otherText.trim()
  const submitCount = selected.length + (otherTrimmed ? 1 : 0)

  function submitMultiple(): void {
    if (submitCount === 0) return
    respond({
      kind: 'options',
      selectedOptionIds: selected,
      otherText: otherTrimmed || undefined,
    })
  }

  function submitOther(): void {
    if (!otherTrimmed) return
    respond({
      kind: 'options',
      selectedOptionIds: allowMultiple ? selected : [],
      otherText: otherTrimmed,
    })
  }

  return (
    <QuestionCardFrame
      item={item}
      requestId={requestId}
      className='animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none p-3'
    >
      <div className='flex items-start justify-between gap-2'>
        <p className='font-medium'>{question.question}</p>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-6 shrink-0 px-2 text-xs text-muted-foreground'
          data-testid='question-skip'
          onClick={() => respond({ kind: 'skipped' })}
        >
          跳过
        </Button>
      </div>

      <div className='mt-2 flex flex-col gap-1'>
        {options.map((option, index) => {
          const active = selected.includes(option.id)
          return (
            <button
              key={option.id}
              type='button'
              className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm leading-5 transition-colors hover:bg-accent'
              data-testid={`question-option-${option.id}`}
              aria-pressed={allowMultiple ? active : undefined}
              onClick={() => toggleOption(option.id)}
            >
              <span
                className={cn(
                  'inline-flex size-5 shrink-0 items-center justify-center rounded text-xs',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {allowMultiple && active ? (
                  <Check className='size-3' />
                ) : (
                  index + 1
                )}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}

        {otherOpen ? (
          <Input
            className='h-8'
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitOther()
              }
            }}
            placeholder='其他…'
            aria-label='其他答案'
            data-testid='question-other-input'
            autoFocus
          />
        ) : (
          <button
            type='button'
            className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent'
            data-testid='question-other'
            onClick={() => setOtherOpen(true)}
          >
            <Pencil className='size-4 shrink-0' aria-hidden />
            <span>其他…</span>
          </button>
        )}
      </div>

      {allowMultiple ? (
        <div className='mt-2 flex justify-end'>
          <Button
            type='button'
            size='sm'
            className='h-7'
            data-testid='question-submit'
            disabled={submitCount === 0}
            onClick={submitMultiple}
          >
            提交所选（{submitCount}）
          </Button>
        </div>
      ) : null}
    </QuestionCardFrame>
  )
}
