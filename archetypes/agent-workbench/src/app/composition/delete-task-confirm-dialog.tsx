/**
 * Presentational delete-task confirm dialog.
 * Composition owns open state and hard-delete command; this is chrome only.
 */

import { Button } from '@/components/ui/button'

export interface DeleteTaskConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteTaskConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: DeleteTaskConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
      data-testid='delete-task-dialog'
      role='dialog'
      aria-modal='true'
      aria-labelledby='delete-task-title'
    >
      <div className='w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-lg'>
        <h2
          id='delete-task-title'
          className='text-[15px] font-semibold tracking-tight'
        >
          删除任务？
        </h2>
        <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
          将从应用中移除此任务。本地事件记录会被删除，无法恢复。
        </p>
        <div className='mt-5 flex justify-end gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            data-testid='delete-task-cancel'
            onClick={onCancel}
          >
            取消
          </Button>
          {/* Soft destructive — light fill + danger text (Codex/WorkBuddy style) */}
          <Button
            type='button'
            variant='destructive'
            size='sm'
            className='rounded-full px-4'
            data-testid='delete-task-confirm'
            onClick={onConfirm}
          >
            移除任务
          </Button>
        </div>
      </div>
    </div>
  )
}
