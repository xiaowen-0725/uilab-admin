import { Circle, CircleCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanSnapshot, PlanStepStatus } from '../../projection/plan-snapshot'
import { planStepStatusLabel, planStepTextClass } from '../plan-step-style'

export interface PlanBlockProps {
  plan: PlanSnapshot | null
}

function StepIcon({ status }: { status: PlanStepStatus }) {
  if (status === 'completed') {
    return (
      <CircleCheck
        className='mt-0.5 size-4 shrink-0 text-primary'
        aria-hidden
      />
    )
  }
  if (status === 'in_progress') {
    return (
      <Loader2
        className='mt-0.5 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none'
        aria-hidden
      />
    )
  }
  return (
    <Circle
      className='mt-0.5 size-4 shrink-0 text-muted-foreground/50'
      aria-hidden
    />
  )
}

export function PlanBlock({ plan }: PlanBlockProps) {
  const steps = plan?.steps ?? []
  if (steps.length === 0) {
    return (
      <p
        data-testid='context-panel-plan-empty'
        className='px-1 text-xs text-muted-foreground'
      >
        本次任务暂无计划
      </p>
    )
  }

  return (
    <ul className='flex flex-col'>
      {steps.map((step, index) => (
        <li
          key={`${index}:${step.step}`}
          className='flex items-start gap-2 rounded-md px-1 py-1'
          data-testid='context-panel-plan-step'
          data-status={step.status}
          aria-label={`${planStepStatusLabel(step.status)}：${step.step}`}
        >
          <StepIcon status={step.status} />
          <span className={cn('text-[13px] leading-5', planStepTextClass(step.status))}>
            {step.step}
          </span>
        </li>
      ))}
    </ul>
  )
}
