import { Button } from '@/components/ui/button'
import type { SurfaceKind } from '../../model/types'

export interface UnknownSurfaceFallbackProps {
  kind: SurfaceKind
  title: string
  resourceKey: string
  tabId: string
  onCloseTab: (tabId: string) => void
}

/**
 * Unknown kind restore UI — Chinese copy, close tab only; never blocks Task Surface.
 */
export function UnknownSurfaceFallback({
  kind,
  title,
  resourceKey,
  tabId,
  onCloseTab,
}: UnknownSurfaceFallbackProps) {
  return (
    <div
      className='flex h-full min-h-0 flex-col items-start gap-3'
      data-testid='work-surface-unknown'
      data-kind={kind}
    >
      <p className='text-sm font-medium text-foreground'>无法打开此工作面</p>
      <p className='text-sm leading-relaxed text-muted-foreground'>
        未注册的类型「{kind}」。可关闭此标签，不影响当前任务对话。
      </p>
      <dl className='space-y-1 font-mono text-xs text-muted-foreground'>
        <div>
          <dt className='inline'>标题：</dt>
          <dd className='inline'>{title}</dd>
        </div>
        <div>
          <dt className='inline'>resourceKey：</dt>
          <dd className='inline'>{resourceKey}</dd>
        </div>
      </dl>
      <Button
        type='button'
        variant='outline'
        size='sm'
        data-testid='work-surface-unknown-close'
        onClick={() => onCloseTab(tabId)}
      >
        关闭标签
      </Button>
    </div>
  )
}
