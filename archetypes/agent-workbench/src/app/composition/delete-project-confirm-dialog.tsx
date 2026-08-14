/**
 * Presentational remove-project confirm dialog.
 * Composition owns open state and list-removal command; this is chrome only.
 * Honest copy: catalog + conversation records leave the app; the folder stays.
 */

import { Button } from '@/components/ui/button'

export interface DeleteProjectConfirmDialogProps {
  open: boolean
  projectName?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteProjectConfirmDialog({
  open,
  projectName,
  onCancel,
  onConfirm,
}: DeleteProjectConfirmDialogProps) {
  if (!open) return null

  const title = projectName
    ? `从列表中移除「${projectName}」？`
    : '从列表中移除项目？'

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
      data-testid='remove-project-dialog'
      role='dialog'
      aria-modal='true'
      aria-labelledby='remove-project-title'
    >
      <div className='w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-lg'>
        <h2
          id='remove-project-title'
          className='text-[15px] font-semibold tracking-tight'
        >
          {title}
        </h2>
        <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
          将从工作台列表中移除此项目及其对话记录。本地文件夹不会被删除。
        </p>
        <div className='mt-5 flex justify-end gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            data-testid='remove-project-cancel'
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type='button'
            variant='destructive'
            size='sm'
            className='rounded-full px-4'
            data-testid='remove-project-confirm'
            onClick={onConfirm}
          >
            从列表中移除
          </Button>
        </div>
      </div>
    </div>
  )
}
