import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isJobRunnable } from '../model/types'
import { formatRelative } from '../model/relative-time'
import type { WidgetDataJobRecord, WidgetJobRunRecord } from '../model/types'

export interface BoardJobDialogProps {
  open: boolean
  job: WidgetDataJobRecord | null
  lastRun: WidgetJobRunRecord | null
  onClose: () => void
  onRevoke?: (jobId: string) => void
  onBindByChat?: () => void
}

function runOutcome(run: WidgetJobRunRecord): string {
  if (run.status === 'success') return '成功'
  if (run.status === 'cancelled') return '已取消'
  if (run.status === 'timeout') return '超时'
  return run.errorMessage ? `失败：${run.errorMessage}` : '失败'
}

export function BoardJobDialog({
  open,
  job,
  lastRun,
  onClose,
  onRevoke,
  onBindByChat,
}: BoardJobDialogProps) {
  const authorized = job ? isJobRunnable(job) : false
  const lastAt = lastRun?.finishedAt ?? lastRun?.startedAt

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className='sm:max-w-md'
        data-testid='board-job-dialog'
      >
        <DialogHeader>
          <DialogTitle>{job?.title ?? '取数作业'}</DialogTitle>
          <DialogDescription>
            {job?.description ||
              '这个小组件还没有取数作业。想让它每天自动更新？在对话里说一声。'}
          </DialogDescription>
        </DialogHeader>

        {job ? (
          <div className='space-y-3 text-sm'>
            <p data-testid='board-job-auth-status'>
              {authorized ? '已授权运行' : '尚未授权，不能运行'}
            </p>
            <p className='text-muted-foreground' data-testid='board-job-last-run'>
              {lastRun && lastAt
                ? `最近一次：${formatRelative(lastAt)} · ${runOutcome(lastRun)}`
                : '还没有运行记录'}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {job && authorized && onRevoke ? (
            <Button
              type='button'
              variant='outline'
              data-testid='board-job-revoke'
              onClick={() => onRevoke(job.id)}
            >
              撤销授权
            </Button>
          ) : null}
          <Button type='button' variant={!job && onBindByChat ? 'ghost' : 'default'} onClick={onClose}>
            关闭
          </Button>
          {!job && onBindByChat ? (
            <Button
              type='button'
              data-testid='board-job-bind-by-chat'
              onClick={() => {
                onClose()
                onBindByChat()
              }}
            >
              去对话里说
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
