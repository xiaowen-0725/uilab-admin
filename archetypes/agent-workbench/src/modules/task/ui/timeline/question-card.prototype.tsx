/**
 * PROTOTYPE — throwaway. Question Request 内联提问卡片的三个 UI 变体（#108）。
 * 路由：/prototype/question-card?variant=a|b|c（仅 DEV 构建挂载）。
 * 三变体在同一 mock 对话上下文中切换；不接任何真实 Runtime/命令。
 * 结论定稿后：胜者按生产约束重写进 timeline，本文件整体移入 throwaway 分支删除。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Pencil,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ---------- 协议形态（#107/#109 定案的 mock） ---------- */

interface QuestionPayload {
  requestId: string
  question: string
  options: Array<{ id: string; label: string }>
  allowMultiple: boolean
}

type QuestionAnswer =
  | { kind: 'options'; selectedOptionIds: string[]; otherText?: string }
  | { kind: 'skipped' }
  | { kind: 'freeText'; text: string }

const MOCK_QUESTION: QuestionPayload = {
  requestId: 'q-demo-1',
  question: '当前环境无法访问外部网络，无法实时搜索确认项目。你指的是哪个 DeepSeek Harness 开源项目？',
  options: [
    { id: 'gh-link', label: '我提供 GitHub 链接' },
    { id: 'lm-eval', label: 'lm-evaluation-harness' },
    { id: 'official', label: 'DeepSeek 官方评估代码' },
    { id: 'opencompass', label: 'OpenCompass 等中文评测框架' },
  ],
  allowMultiple: false,
}

/* ---------- 每个变体共用的本地状态钩子 ---------- */

function useQuestionState(allowMultiple: boolean) {
  const [selected, setSelected] = useState<string[]>([])
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [answer, setAnswer] = useState<QuestionAnswer | null>(null)

  const toggle = (id: string) => {
    if (answer) return
    if (!allowMultiple) {
      setAnswer({ kind: 'options', selectedOptionIds: [id] })
      return
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }
  const submitMulti = () => {
    if (selected.length === 0 && !otherText.trim()) return
    setAnswer({
      kind: 'options',
      selectedOptionIds: selected,
      ...(otherText.trim() ? { otherText: otherText.trim() } : {}),
    })
  }
  const submitOther = () => {
    if (!otherText.trim()) return
    if (allowMultiple) {
      submitMulti()
      return
    }
    setAnswer({ kind: 'options', selectedOptionIds: [], otherText: otherText.trim() })
  }
  const skip = () => setAnswer({ kind: 'skipped' })
  const reply = (text: string) => setAnswer({ kind: 'freeText', text })
  const reset = () => {
    setSelected([])
    setOtherOpen(false)
    setOtherText('')
    setAnswer(null)
  }
  return {
    selected,
    otherOpen,
    setOtherOpen,
    otherText,
    setOtherText,
    answer,
    toggle,
    submitMulti,
    submitOther,
    skip,
    reply,
    reset,
  }
}

type QState = ReturnType<typeof useQuestionState>

function answeredSummary(q: QuestionPayload, answer: QuestionAnswer): string {
  if (answer.kind === 'skipped') return '已跳过'
  if (answer.kind === 'freeText') return `直接回复：${answer.text}`
  const labels = answer.selectedOptionIds.map(
    (id) => q.options.find((o) => o.id === id)?.label ?? id,
  )
  if (answer.otherText) labels.push(`其他：${answer.otherText}`)
  return labels.join('、')
}

/* ---------- 变体 A：对话内嵌列表（Claude Code 风格） ---------- */

function VariantA({ q, s }: { q: QuestionPayload; s: QState }) {
  if (s.answer) {
    return (
      <div className='mb-2 max-w-[46rem] rounded-lg border bg-muted/40 px-4 py-3 text-sm'>
        <div className='text-muted-foreground'>{q.question}</div>
        <div className='mt-1 font-medium'>{answeredSummary(q, s.answer)}</div>
      </div>
    )
  }
  return (
    <div className='mb-2 max-w-[46rem] rounded-lg border bg-muted/40 p-2 text-sm shadow-sm'>
      <div className='flex items-start justify-between gap-3 px-2 pt-1.5 pb-2'>
        <div className='font-medium'>{q.question}</div>
        <Button
          variant='ghost'
          size='sm'
          className='h-6 shrink-0 px-2 text-xs text-muted-foreground'
          onClick={s.skip}
        >
          跳过
        </Button>
      </div>
      <div className='flex flex-col gap-1'>
        {q.options.map((opt, i) => {
          const checked = s.selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              type='button'
              onClick={() => s.toggle(opt.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors hover:bg-accent',
                checked && 'bg-accent',
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded text-xs',
                  checked
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {q.allowMultiple && checked ? <Check className='size-3.5' /> : i + 1}
              </span>
              <span>{opt.label}</span>
            </button>
          )
        })}
        {s.otherOpen ? (
          <div className='flex items-center gap-2 px-2 py-1'>
            <Input
              autoFocus
              value={s.otherText}
              onChange={(e) => s.setOtherText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && s.submitOther()}
              placeholder='输入其他答案，回车提交'
              className='h-8'
            />
          </div>
        ) : (
          <button
            type='button'
            onClick={() => s.setOtherOpen(true)}
            className='flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-muted-foreground transition-colors hover:bg-accent'
          >
            <span className='flex size-5 shrink-0 items-center justify-center rounded bg-muted'>
              <Pencil className='size-3' />
            </span>
            <span>其他…</span>
          </button>
        )}
      </div>
      {q.allowMultiple ? (
        <div className='flex justify-end px-2 pt-2 pb-1'>
          <Button size='sm' className='h-7' onClick={s.submitMulti}>
            提交所选（{s.selected.length}）
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ---------- 变体 B：表单卡片（延续 input-request 天空色语义） ---------- */

function VariantB({ q, s }: { q: QuestionPayload; s: QState }) {
  if (s.answer) {
    return (
      <div className='mb-2 max-w-[46rem] rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm'>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <CircleHelp className='size-3.5' />
          已作答
        </div>
        <div className='mt-1'>{q.question}</div>
        <div className='mt-1 font-medium'>{answeredSummary(q, s.answer)}</div>
      </div>
    )
  }
  return (
    <div className='mb-2 max-w-[46rem] rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm'>
      <div className='flex items-center gap-2 font-medium'>
        <CircleHelp className='size-4 text-sky-600' />
        需要你的决定
      </div>
      <div className='mt-2'>{q.question}</div>
      <div className='mt-3 flex flex-col gap-2'>
        {q.options.map((opt) => {
          const checked = s.selected.includes(opt.id)
          return (
            <label
              key={opt.id}
              className='flex cursor-pointer items-center gap-2.5'
              onClick={() => (q.allowMultiple ? s.toggle(opt.id) : undefined)}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center border',
                  q.allowMultiple ? 'rounded-[3px]' : 'rounded-full',
                  checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-muted-foreground/50',
                )}
                onClick={() => (!q.allowMultiple ? s.toggle(opt.id) : undefined)}
              >
                {checked ? <Check className='size-3' /> : null}
              </span>
              <span onClick={() => (!q.allowMultiple ? s.toggle(opt.id) : undefined)}>
                {opt.label}
              </span>
            </label>
          )
        })}
        <div className='flex items-center gap-2.5'>
          <span className='size-4 shrink-0' />
          <Input
            value={s.otherText}
            onChange={(e) => s.setOtherText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && s.submitOther()}
            placeholder='其他（自由填写）…'
            className='h-8 max-w-72'
          />
        </div>
      </div>
      <div className='mt-3 flex items-center gap-2'>
        {q.allowMultiple ? (
          <Button size='sm' className='h-7' onClick={s.submitMulti}>
            确认
          </Button>
        ) : null}
        <Button
          size='sm'
          variant='outline'
          className='h-7'
          onClick={s.skip}
        >
          <SkipForward className='size-3.5' />
          跳过
        </Button>
        <span className='text-xs text-muted-foreground'>
          {q.allowMultiple ? '可多选' : '单选，点击即作答'}；也可直接在下方输入框回复
        </span>
      </div>
    </div>
  )
}

/* ---------- 变体 C：轻量 chips（plan-update 同族的时间线原生风格） ---------- */

function VariantC({ q, s }: { q: QuestionPayload; s: QState }) {
  if (s.answer) {
    return (
      <div className='mb-2 max-w-[46rem] px-1 py-1.5 text-sm'>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground'>•</span>
          <span className='font-semibold'>提问已作答</span>
        </div>
        <div className='mt-1 border-s ps-4 text-sm text-muted-foreground'>
          {q.question}
          <span className='ms-2 text-foreground'>{answeredSummary(q, s.answer)}</span>
        </div>
      </div>
    )
  }
  return (
    <div className='mb-2 max-w-[46rem] px-1 py-1.5 text-sm'>
      <div className='flex items-center gap-2'>
        <span className='text-muted-foreground'>•</span>
        <span className='font-semibold'>{q.question}</span>
      </div>
      <div className='mt-2 flex flex-col gap-2 border-s ps-4'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {q.options.map((opt) => {
            const checked = s.selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type='button'
                onClick={() => s.toggle(opt.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary hover:text-primary',
                  checked && 'border-primary bg-primary/10 text-primary',
                )}
              >
                {opt.label}
              </button>
            )
          })}
          {s.otherOpen ? (
            <Input
              autoFocus
              value={s.otherText}
              onChange={(e) => s.setOtherText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && s.submitOther()}
              placeholder='其他…'
              className='h-7 w-44 rounded-full text-xs'
            />
          ) : (
            <button
              type='button'
              onClick={() => s.setOtherOpen(true)}
              className='rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary'
            >
              其他…
            </button>
          )}
        </div>
        <div className='flex items-center gap-3 text-xs text-muted-foreground'>
          {q.allowMultiple ? (
            <Button size='sm' className='h-6 px-2 text-xs' onClick={s.submitMulti}>
              提交
            </Button>
          ) : null}
          <button type='button' className='underline-offset-2 hover:underline' onClick={s.skip}>
            跳过此问题
          </button>
          <span>或直接在输入框回复</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Mock 对话上下文 + 页面骨架 ---------- */

const VARIANTS = [
  { key: 'a', name: '对话内嵌列表（Claude Code 风格）', component: VariantA },
  { key: 'b', name: '表单卡片（input-request 同族）', component: VariantB },
  { key: 'c', name: '轻量 chips（时间线原生）', component: VariantC },
] as const

function readVariantKey(): string {
  const v = new URLSearchParams(window.location.search).get('variant')
  return VARIANTS.some((x) => x.key === v) ? (v as string) : 'a'
}

export function QuestionCardPrototypePage() {
  const [variantKey, setVariantKey] = useState(readVariantKey)
  const [allowMultiple, setAllowMultiple] = useState(false)
  const q = useMemo(
    () => ({ ...MOCK_QUESTION, allowMultiple }),
    [allowMultiple],
  )
  const s = useQuestionState(allowMultiple)
  const [composerText, setComposerText] = useState('')

  const go = (dir: 1 | -1) => {
    const idx = VARIANTS.findIndex((v) => v.key === variantKey)
    const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length]!
    setVariantKey(next.key)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next.key)
    window.history.replaceState(null, '', url)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const variant = VARIANTS.find((v) => v.key === variantKey)!
  const Card = variant.component

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='mx-auto flex max-w-[46rem] flex-col px-6 py-10'>
        {/* mock 对话上下文 */}
        <div className='mb-6 self-end rounded-2xl bg-muted px-4 py-2 text-sm'>
          帮我写一篇 DeepSeek Harness 开源项目的简介
        </div>
        <p className='mb-4 max-w-[42rem] text-sm leading-relaxed text-muted-foreground'>
          好的。但当前环境的联网搜索工具不可用，我没法直接确认这个项目的具体信息。为了不耽误你，我需要先确认一个问题：
        </p>

        <Card q={q} s={s} />

        {/* 将回传的 answer（surface the state） */}
        <pre className='mt-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground'>
          {`provideRunInput.answer = ${s.answer ? JSON.stringify(s.answer, null, 2) : '（未作答）'}`}
        </pre>

        {/* mock Composer：直接回复通道 */}
        <div className='mt-6 flex items-center gap-2 rounded-xl border bg-card px-3 py-2'>
          <Input
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && composerText.trim() && !s.answer) {
                s.reply(composerText.trim())
                setComposerText('')
              }
            }}
            placeholder={s.answer ? '（已作答，仅演示）' : '或直接回复…'}
            className='border-0 shadow-none focus-visible:ring-0'
          />
        </div>

        {/* 原型控制条（非设计的一部分） */}
        <div className='mt-8 flex items-center gap-3 text-xs text-muted-foreground'>
          <label className='flex cursor-pointer items-center gap-1.5'>
            <input
              type='checkbox'
              checked={allowMultiple}
              onChange={(e) => {
                setAllowMultiple(e.target.checked)
                s.reset()
              }}
            />
            allow_multiple（多选）
          </label>
          <Button variant='outline' size='sm' className='h-6 px-2 text-xs' onClick={s.reset}>
            重置作答
          </Button>
        </div>
      </div>

      {/* 浮动变体切换条 */}
      <div className='fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-foreground px-3 py-1.5 text-sm text-background shadow-lg'>
        <button type='button' onClick={() => go(-1)} aria-label='上一个变体'>
          <ChevronLeft className='size-4' />
        </button>
        <span className='min-w-64 text-center text-xs'>
          {variant.key.toUpperCase()} — {variant.name}
        </span>
        <button type='button' onClick={() => go(1)} aria-label='下一个变体'>
          <ChevronRight className='size-4' />
        </button>
      </div>
    </div>
  )
}
