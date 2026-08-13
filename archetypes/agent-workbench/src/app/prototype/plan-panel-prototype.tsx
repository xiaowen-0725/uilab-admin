/**
 * PROTOTYPE — throwaway. Issue #96: Task Context Panel「计划」区块 + Timeline 计划卡呈现原型。
 * 三个结构不同的变体，`?variant=A|B|C` 切换（底部浮动条 / ←→ 键）。
 * 假数据、无持久化、不接 runtime。评审后整体移出 main。
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  FileText,
  Loader2,
  SquareTerminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

type StepStatus = 'pending' | 'in_progress' | 'completed'

interface PlanStep {
  step: string
  status: StepStatus
}

interface PlanSnapshot {
  explanation?: string
  steps: PlanStep[]
}

type PlanScenario = 'mid' | 'done' | 'empty'

const SCENARIOS: Record<PlanScenario, PlanSnapshot> = {
  mid: {
    explanation: '参数装配比预期复杂，拆出独立步骤',
    steps: [
      { step: '调研审批 OpenAPI 与鉴权方式', status: 'completed' },
      { step: '生成连接器描述与工具映射', status: 'completed' },
      { step: '实现审批发起表单的参数装配', status: 'in_progress' },
      { step: '联调沙箱环境端到端流程', status: 'pending' },
      { step: '补充错误处理与审批状态轮询', status: 'pending' },
    ],
  },
  done: {
    steps: [
      { step: '调研审批 OpenAPI 与鉴权方式', status: 'completed' },
      { step: '生成连接器描述与工具映射', status: 'completed' },
      { step: '实现审批发起表单的参数装配', status: 'completed' },
      { step: '联调沙箱环境端到端流程', status: 'completed' },
      { step: '补充错误处理与审批状态轮询', status: 'completed' },
    ],
  },
  empty: { steps: [] },
}

function progressOf(plan: PlanSnapshot): { done: number; total: number } {
  return {
    done: plan.steps.filter((s) => s.status === 'completed').length,
    total: plan.steps.length,
  }
}

/* ---------- 共用：步骤行（各变体自行决定是否使用） ---------- */

function StepIcon({ status, size = 'sm' }: { status: StepStatus; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'size-5' : 'size-4'
  if (status === 'completed')
    return <CircleCheck className={cn(cls, 'shrink-0 text-primary')} aria-hidden />
  if (status === 'in_progress')
    return <Loader2 className={cn(cls, 'shrink-0 animate-spin text-primary')} aria-hidden />
  return <Circle className={cn(cls, 'shrink-0 text-muted-foreground/50')} aria-hidden />
}

function stepTextCls(status: StepStatus): string {
  if (status === 'completed') return 'text-muted-foreground line-through decoration-muted-foreground/60'
  if (status === 'in_progress') return 'font-medium text-foreground'
  return 'text-muted-foreground'
}

/* ---------- 共用：左列 mock Timeline（计划卡样式随变体切换） ---------- */

function MockTimeline({ planCard }: { planCard: React.ReactNode }) {
  return (
    <div className='flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5'>
      <div className='self-end rounded-2xl bg-primary/10 px-4 py-2.5 text-sm'>
        帮我把飞书审批连接器接进项目，走通端到端流程
      </div>
      <div className='flex flex-col gap-2 text-sm'>
        <div className='flex items-center gap-2 text-muted-foreground'>
          <FileText className='size-4' aria-hidden />
          <span>
            读取 <span className='text-foreground'>docs/adr/0016-connector-model.md</span>
          </span>
        </div>
        <div className='flex items-center gap-2 text-muted-foreground'>
          <SquareTerminal className='size-4' aria-hidden />
          <span className='font-mono text-xs'>$ pnpm check:workbench</span>
        </div>
      </div>
      {planCard}
      <div className='max-w-[46rem] text-sm leading-6 text-foreground'>
        我先梳理了审批 OpenAPI 的鉴权方式，接下来按计划实现表单参数装配，完成后会在沙箱环境做端到端联调。
      </div>
      <div className='mt-auto pt-4'>
        <div className='rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground'>
          继续输入，或让我调整计划…
        </div>
      </div>
    </div>
  )
}

/* ================================================================
 * 变体 A —「Codex 分区面板」：多区块堆叠索引，计划区块置顶，行紧凑。
 * Timeline 卡：Codex "Updated Plan" 同款（• 计划已更新 + 斜体说明 + 勾选列表）。
 * ================================================================ */

function PlanCardA({ plan }: { plan: PlanSnapshot }) {
  return (
    <div className='max-w-[46rem] text-sm'>
      <div className='flex items-center gap-2'>
        <span className='text-muted-foreground'>•</span>
        <span className='font-semibold'>计划已更新</span>
      </div>
      <div className='mt-1 flex flex-col gap-1 border-l pl-4 text-[13px]'>
        {plan.explanation ? (
          <p className='text-muted-foreground italic'>{plan.explanation}</p>
        ) : null}
        {plan.steps.length === 0 ? (
          <p className='text-muted-foreground italic'>（无步骤）</p>
        ) : (
          plan.steps.map((s) => (
            <div key={s.step} className='flex items-start gap-2'>
              {s.status === 'completed' ? (
                <Check className='mt-0.5 size-3.5 shrink-0 text-primary' aria-hidden />
              ) : (
                <span
                  className={cn(
                    'mt-0.5 inline-block size-3.5 shrink-0 rounded-[3px] border',
                    s.status === 'in_progress' ? 'border-primary' : 'border-muted-foreground/40',
                  )}
                  aria-hidden
                />
              )}
              <span className={stepTextCls(s.status)}>{s.step}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PanelA({ plan }: { plan: PlanSnapshot }) {
  const { done, total } = progressOf(plan)
  return (
    <PanelFrame>
      <PanelSection
        title='计划'
        trailing={
          total > 0 ? (
            <span className='text-xs tabular-nums text-muted-foreground'>
              {done}/{total}
            </span>
          ) : null
        }
      >
        {plan.steps.length === 0 ? (
          <p className='px-1 text-xs text-muted-foreground'>本次任务暂无计划</p>
        ) : (
          <ul className='flex flex-col'>
            {plan.steps.map((s) => (
              <li key={s.step} className='flex items-start gap-2 rounded-md px-1 py-1'>
                <StepIcon status={s.status} />
                <span className={cn('text-[13px] leading-5', stepTextCls(s.status))}>{s.step}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <Separator />
      <PanelSection title='环境信息' dim>
        <p className='px-1 text-xs text-muted-foreground'>规划中的区块（占位）</p>
      </PanelSection>
      <Separator />
      <PanelSection title='变更' dim>
        <p className='px-1 text-xs text-muted-foreground'>规划中的区块（占位）</p>
      </PanelSection>
    </PanelFrame>
  )
}

/* ================================================================
 * 变体 B —「Claude Progress 卡」：大圆勾 + 删除线 + 可折叠区块，卡片化分组。
 * Timeline 卡：面板同款迷你卡（带边框卡片），突出与面板的视觉一致性。
 * ================================================================ */

function PlanCardB({ plan }: { plan: PlanSnapshot }) {
  return (
    <div className='max-w-[46rem] rounded-xl border bg-card px-4 py-3 text-sm shadow-xs'>
      <div className='flex items-center justify-between'>
        <span className='font-semibold'>计划</span>
        {plan.explanation ? (
          <span className='text-xs text-muted-foreground italic'>{plan.explanation}</span>
        ) : null}
      </div>
      <div className='mt-2 flex flex-col gap-1.5'>
        {plan.steps.length === 0 ? (
          <p className='text-muted-foreground italic'>（无步骤）</p>
        ) : (
          plan.steps.map((s) => (
            <div key={s.step} className='flex items-start gap-2.5'>
              <StepIcon status={s.status} />
              <span className={cn('text-[13px] leading-5', stepTextCls(s.status))}>{s.step}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PanelB({ plan }: { plan: PlanSnapshot }) {
  const { done, total } = progressOf(plan)
  const [open, setOpen] = useState(true)
  return (
    <PanelFrame plain>
      <div className='rounded-xl border bg-card p-3 shadow-xs'>
        <button
          type='button'
          className='flex w-full items-center gap-1.5 text-left'
          onClick={() => setOpen((v) => !v)}
        >
          <span className='text-sm font-semibold'>计划</span>
          <ChevronDown
            className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')}
            aria-hidden
          />
          <span className='ml-auto text-xs tabular-nums text-muted-foreground'>
            {total > 0 ? `${done}/${total}` : ''}
          </span>
        </button>
        {open ? (
          <div className='mt-2.5 flex flex-col gap-2'>
            {plan.steps.length === 0 ? (
              <p className='text-xs text-muted-foreground'>本次任务暂无计划</p>
            ) : (
              plan.steps.map((s) => (
                <div key={s.step} className='flex items-start gap-2.5'>
                  <StepIcon status={s.status} size='lg' />
                  <span className={cn('text-sm leading-5', stepTextCls(s.status))}>{s.step}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      <div className='mt-3 rounded-xl border bg-card p-3 shadow-xs opacity-60'>
        <div className='flex items-center gap-1.5'>
          <span className='text-sm font-semibold'>工作目录</span>
          <ChevronDown className='size-4 text-muted-foreground' aria-hidden />
        </div>
        <p className='mt-2 text-xs text-muted-foreground'>规划中的区块（占位）</p>
      </div>
    </PanelFrame>
  )
}

/* ================================================================
 * 变体 C —「进度优先 hero」：顶部进度条 + “正在进行”主行，已完成折叠分组。
 * Timeline 卡：单行摘要（计划已更新 · 3/5 · 当前步骤），点击展开假设不做。
 * ================================================================ */

function PlanCardC({ plan }: { plan: PlanSnapshot }) {
  const { done, total } = progressOf(plan)
  const current = plan.steps.find((s) => s.status === 'in_progress')
  return (
    <div className='flex max-w-[46rem] items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[13px]'>
      <Loader2 className='size-3.5 shrink-0 animate-spin text-primary' aria-hidden />
      <span className='font-medium'>计划已更新</span>
      <span className='tabular-nums text-muted-foreground'>
        {total > 0 ? `${done}/${total}` : '（无步骤）'}
      </span>
      {current ? <span className='truncate text-muted-foreground'>· {current.step}</span> : null}
    </div>
  )
}

function PanelC({ plan }: { plan: PlanSnapshot }) {
  const { done, total } = progressOf(plan)
  const current = plan.steps.find((s) => s.status === 'in_progress')
  const completed = plan.steps.filter((s) => s.status === 'completed')
  const pending = plan.steps.filter((s) => s.status === 'pending')
  const [showDone, setShowDone] = useState(false)
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <PanelFrame>
      <div className='px-3 pt-3'>
        <div className='flex items-baseline justify-between'>
          <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>计划</h3>
          <span className='text-xs tabular-nums text-muted-foreground'>
            {total > 0 ? `${done}/${total}` : ''}
          </span>
        </div>
        <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'>
          <div className='h-full rounded-full bg-primary transition-all' style={{ width: `${pct}%` }} />
        </div>
        {total === 0 ? (
          <p className='py-3 text-xs text-muted-foreground'>本次任务暂无计划</p>
        ) : current ? (
          <div className='mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2'>
            <p className='text-[11px] font-medium text-primary'>正在进行</p>
            <p className='mt-0.5 text-sm font-medium leading-5'>{current.step}</p>
          </div>
        ) : (
          <div className='mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary'>
            计划已全部完成
          </div>
        )}
        {pending.length > 0 ? (
          <ul className='mt-3 flex flex-col gap-1.5'>
            {pending.map((s) => (
              <li key={s.step} className='flex items-start gap-2'>
                <Circle className='mt-0.5 size-3.5 shrink-0 text-muted-foreground/50' aria-hidden />
                <span className='text-[13px] leading-5 text-muted-foreground'>{s.step}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {completed.length > 0 ? (
          <button
            type='button'
            className='mt-3 mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            onClick={() => setShowDone((v) => !v)}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', !showDone && '-rotate-90')}
              aria-hidden
            />
            已完成 {completed.length} 项
          </button>
        ) : null}
        {showDone ? (
          <ul className='-mt-1 mb-3 flex flex-col gap-1.5'>
            {completed.map((s) => (
              <li key={s.step} className='flex items-start gap-2'>
                <Check className='mt-0.5 size-3.5 shrink-0 text-primary' aria-hidden />
                <span className='text-[13px] leading-5 text-muted-foreground line-through decoration-muted-foreground/60'>
                  {s.step}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PanelFrame>
  )
}

/* ---------- 面板骨架（模拟 Task Context Panel 卡片） ---------- */

function PanelFrame({ children, plain }: { children: React.ReactNode; plain?: boolean }) {
  if (plain) {
    return (
      <aside className='flex w-[19rem] shrink-0 flex-col overflow-y-auto border-l bg-background p-3'>
        <header className='mb-2 flex items-center justify-between px-1'>
          <h2 className='text-sm font-semibold'>任务上下文</h2>
          <span className='text-xs text-muted-foreground'>关闭</span>
        </header>
        {children}
      </aside>
    )
  }
  return (
    <aside className='flex w-[19rem] shrink-0 flex-col border-l bg-background'>
      <header className='flex shrink-0 items-center justify-between gap-2 px-3 py-2'>
        <h2 className='text-sm font-semibold'>任务上下文</h2>
        <span className='text-xs text-muted-foreground'>关闭</span>
      </header>
      <Separator />
      <div className='flex flex-col overflow-y-auto'>{children}</div>
    </aside>
  )
}

function PanelSection({
  title,
  trailing,
  dim,
  children,
}: {
  title: string
  trailing?: React.ReactNode
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={cn('px-3 py-3', dim && 'opacity-50')}>
      <div className='mb-1.5 flex items-baseline justify-between'>
        <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>{title}</h3>
        {trailing}
      </div>
      {children}
    </section>
  )
}

/* ---------- 原型页组装 ---------- */

const VARIANTS = [
  { key: 'A', name: 'Codex 分区面板', Panel: PanelA, PlanCard: PlanCardA },
  { key: 'B', name: 'Claude Progress 卡', Panel: PanelB, PlanCard: PlanCardB },
  { key: 'C', name: '进度优先 hero', Panel: PanelC, PlanCard: PlanCardC },
] as const

type VariantKey = (typeof VARIANTS)[number]['key']

function readVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get('variant')
  return v === 'B' || v === 'C' ? v : 'A'
}

export function PlanPanelPrototypePage() {
  const [variant, setVariant] = useState<VariantKey>(() => readVariant())
  const [scenario, setScenario] = useState<PlanScenario>('mid')

  const go = (dir: 1 | -1) => {
    const idx = VARIANTS.findIndex((v) => v.key === variant)
    const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length].key
    setVariant(next)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url.toString())
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]
  const plan = useMemo(() => SCENARIOS[scenario], [scenario])

  return (
    <div className='flex h-screen flex-col bg-background text-foreground'>
      <div className='flex items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground'>
        <span className='rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-600'>
          PROTOTYPE
        </span>
        <span>#96 任务上下文面板「计划」区块 + Timeline 计划卡</span>
        <span className='ml-auto flex items-center gap-1'>
          计划状态：
          {(
            [
              ['mid', '进行中'],
              ['done', '全部完成'],
              ['empty', '空计划'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type='button'
              onClick={() => setScenario(key)}
              className={cn(
                'rounded-full px-2 py-0.5',
                scenario === key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className='flex min-h-0 flex-1'>
        <MockTimeline planCard={<active.PlanCard plan={plan} />} />
        <active.Panel plan={plan} />
      </div>
      {import.meta.env.DEV ? (
        <div className='fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-foreground px-3 py-1.5 text-sm text-background shadow-lg'>
          <button type='button' onClick={() => go(-1)} aria-label='上一个变体'>
            <ChevronLeft className='size-4' />
          </button>
          <span className='min-w-40 text-center font-medium'>
            {active.key} — {active.name}
          </span>
          <button type='button' onClick={() => go(1)} aria-label='下一个变体'>
            <ChevronRight className='size-4' />
          </button>
        </div>
      ) : null}
    </div>
  )
}
