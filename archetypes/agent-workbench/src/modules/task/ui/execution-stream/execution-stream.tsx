import type { ExecutionItem } from '../../model/types'

/** Phase 3 UI honesty copy — static fixture only, not Runtime projection. */
const FIXTURE_DISCLOSURE =
  '静态 Phase 3 fixture — 非真实 Agent Runtime / 非真实执行流'

export interface ExecutionStreamProps {
  items: ExecutionItem[]
}

function itemClassName(kind: ExecutionItem['kind']): string {
  switch (kind) {
    case 'user':
      return 'ml-8 rounded-xl border border-border bg-primary/5 px-3 py-2 text-sm'
    case 'tool':
      return 'rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-sm'
    case 'assistant':
      return 'mr-8 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm'
  }
}

function itemRoleLabel(kind: ExecutionItem['kind']): string {
  switch (kind) {
    case 'user':
      return '用户'
    case 'assistant':
      return '助手'
    case 'tool':
      return '工具活动'
  }
}

export function ExecutionStream({ items }: ExecutionStreamProps) {
  return (
    <div
      className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3'
      data-slot='execution-stream'
      data-testid='execution-stream'
      aria-label='执行流（静态 fixture）'
    >
      <div className='mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-3'>
        <p
          className='rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'
          data-testid='fixture-disclosure'
        >
          {FIXTURE_DISCLOSURE}
        </p>

        <ul className='flex flex-col gap-3'>
          {items.map((item) => (
            <li
              key={item.id}
              className={itemClassName(item.kind)}
              data-kind={item.kind}
            >
              <div className='mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground'>
                <span>{itemRoleLabel(item.kind)}</span>
                {item.kind === 'tool' && (
                  <span className='rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground'>
                    {item.status === 'completed' ? '已完成' : item.status}
                  </span>
                )}
                {item.title ? (
                  <span className='font-mono'>{item.title}</span>
                ) : null}
              </div>
              <p className='whitespace-pre-wrap text-foreground'>{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
