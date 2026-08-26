import { useState, type ReactNode } from 'react'
import { ConversationIcon } from '@/components/icons/conversation-icon'
import {
  ThreadCard,
  ThreadElicitation,
} from '@/components/motion/agent-thread'
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

const OPTION_ROW =
  'flex w-full items-start gap-2 rounded-lg border border-[var(--wb-border)] px-3 py-2 text-left text-[15px] leading-[26.7px] transition-colors hover:bg-[var(--wb-hover-subtle)]'

function QuestionGlyph() {
  return (
    <ConversationIcon
      name='assistant'
      className='size-4 text-black/50'
    />
  )
}

function QuestionCardFrame({
  item,
  requestId,
  children,
}: {
  item: TimelineItem
  requestId: string
  children: ReactNode
}) {
  return (
    <div
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

function singleSelectedOptionId(item: TimelineItem): string | null {
  const answer = item.meta?.answer
  if (answer?.kind !== 'options' || answer.otherText) return null
  if (answer.selectedOptionIds.length !== 1) return null
  return answer.selectedOptionIds[0] ?? null
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
    const selectedId = singleSelectedOptionId(item)
    if (selectedId) {
      return (
        <QuestionCardFrame item={item} requestId={requestId}>
          <ThreadElicitation
            icon={<ConversationIcon name='assistant' className='size-5' />}
            prompt={question.question}
            options={options.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            value={selectedId}
          />
        </QuestionCardFrame>
      )
    }
    const answerLabel = item.meta?.answer
      ? formatQuestionAnswerLabel(item.meta.answer, options)
      : '已提供'
    return (
      <QuestionCardFrame item={item} requestId={requestId}>
        <ThreadCard>
          <div className='flex items-center gap-3 px-3 py-2.5'>
            <QuestionGlyph />
            <div className='min-w-0 flex-1'>
              <p className='text-pretty font-medium text-[15px] leading-[26.7px]'>
                {question.question}
              </p>
              <p className='mt-1 text-[15px] leading-[26.7px]'>{answerLabel}</p>
            </div>
          </div>
        </ThreadCard>
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
    <QuestionCardFrame item={item} requestId={requestId}>
      <ThreadCard className='animate-in fade-in slide-in-from-bottom-1 border-[color-mix(in_srgb,var(--tl-wait-border)_70%,transparent)] duration-200 motion-reduce:animate-none'>
        <div className='flex items-center gap-3 px-3 py-2.5'>
          <QuestionGlyph />
          <p className='min-w-0 flex-1 text-pretty font-medium text-[15px] leading-[26.7px]'>
            {question.question}
          </p>
          <button
            type='button'
            data-testid='question-skip'
            className='flex h-7 items-center rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-[var(--wb-hover)] hover:text-foreground'
            onClick={() => respond({ kind: 'skipped' })}
          >
            跳过
          </button>
        </div>

        <div className='flex flex-col gap-1 px-3 pb-3'>
          {options.map((option) => {
            const active = selected.includes(option.id)
            return (
              <button
                key={option.id}
                type='button'
                className={cn(
                  OPTION_ROW,
                  active && 'border-[var(--wb-accent)] ring-1 ring-[var(--wb-accent)]/30',
                )}
                data-testid={`question-option-${option.id}`}
                aria-pressed={allowMultiple ? active : undefined}
                onClick={() => toggleOption(option.id)}
              >
                <span className='min-w-0 flex-1'>{option.label}</span>
                {allowMultiple && active ? (
                  <ConversationIcon
                    name='check'
                    className='mt-0.5 size-4 text-[var(--wb-accent)]'
                  />
                ) : null}
              </button>
            )
          })}

          {otherOpen ? (
            <Input
              name='question-other'
              autoComplete='off'
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
            />
          ) : (
            <button
              type='button'
              className={cn(OPTION_ROW, 'text-muted-foreground')}
              data-testid='question-other'
              onClick={() => setOtherOpen(true)}
            >
              <ConversationIcon name='edit' className='opacity-80' />
              <span>其他…</span>
            </button>
          )}

          {allowMultiple ? (
            <div className='mt-1 flex justify-end'>
              <button
                type='button'
                data-testid='question-submit'
                disabled={submitCount === 0}
                className='flex h-7 items-center rounded-lg bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40'
                onClick={submitMultiple}
              >
                提交所选（{submitCount}）
              </button>
            </div>
          ) : null}
        </div>
      </ThreadCard>
    </QuestionCardFrame>
  )
}
