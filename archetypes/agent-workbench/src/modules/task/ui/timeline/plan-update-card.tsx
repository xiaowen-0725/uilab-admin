import { CheckIcon as Check } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { PlanStepStatus } from '../../projection/plan-snapshot'
import type { TimelineItem } from '../../projection/types'
import { planStepStatusLabel, planStepTextClass } from '../plan-step-style'

export interface PlanUpdateCardProps {
  item: TimelineItem
}

export function PlanUpdateCard({ item }: PlanUpdateCardProps) {
  const plan = item.meta?.plan
  const steps = plan?.steps ?? []
  const explanation = plan?.explanation ?? item.body

  return (
    <div
      className='tl-chrome max-w-[46rem] px-1 py-1'
      data-kind='plan-update'
      data-testid={`timeline-item-${item.id}`}
      data-category='plan-update'
    >
      <div className='flex items-center gap-2'>
        <span className='text-muted-foreground' aria-hidden>
          •
        </span>
        <span className='font-semibold'>{item.title ?? '计划已更新'}</span>
      </div>
      <div className='mt-1 flex flex-col gap-0.5 border-s ps-4'>
        {explanation ? (
          <p
            data-plan-explanation=''
            className='text-muted-foreground italic'
          >
            {explanation}
          </p>
        ) : null}
        {steps.length === 0 ? (
          <p className='text-muted-foreground italic'>（无步骤）</p>
        ) : (
          steps.map((step, index) => (
            <div
              key={`${index}:${step.step}`}
              className='flex items-start gap-2'
              aria-label={`${planStepStatusLabel(step.status)}：${step.step}`}
            >
              <PlanUpdateStepMark status={step.status} />
              <span className={planStepTextClass(step.status)}>{step.step}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PlanUpdateStepMark({ status }: { status: PlanStepStatus }) {
  if (status === 'completed') {
    return (
      <Check
        className='mt-0.5 size-3.5 shrink-0 text-primary'
        aria-hidden
      />
    )
  }
  return (
    <span
      className={cn(
        'mt-0.5 inline-block size-3.5 shrink-0 rounded-[3px] border',
        status === 'in_progress'
          ? 'border-primary'
          : 'border-muted-foreground/40',
      )}
      aria-hidden
    />
  )
}
