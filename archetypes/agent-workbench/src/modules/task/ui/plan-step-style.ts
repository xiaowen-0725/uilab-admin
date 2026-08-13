import type { PlanStepStatus } from '../projection/plan-snapshot'

export function planStepTextClass(status: PlanStepStatus): string {
  if (status === 'completed') {
    return 'text-muted-foreground line-through decoration-muted-foreground/60'
  }
  if (status === 'in_progress') {
    return 'font-medium text-foreground'
  }
  return 'text-muted-foreground'
}

export function planStepStatusLabel(status: PlanStepStatus): string {
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '进行中'
  return '待处理'
}
