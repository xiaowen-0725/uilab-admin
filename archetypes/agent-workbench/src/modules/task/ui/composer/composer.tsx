import { useId, useState } from 'react'
import { Button } from '@uilab/foundation/ui/button'

export interface ComposerProps {
  /** Optional notice shown when the user attempts submit (local only). */
  disabledReason?: string
}

/**
 * Composer accepts local text. Submit stays disabled for Runtime calls;
 * a local notice explains that Phase 3 has no Runtime.
 */
export function Composer({
  disabledReason = 'Phase 3 静态 Shell：提交不会调用 Agent Runtime',
}: ComposerProps) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = useId()

  return (
    <div
      className='border-t border-border bg-background/80 px-3 py-3 backdrop-blur-sm'
      data-slot='composer'
    >
      <label className='sr-only' htmlFor='workbench-composer-input'>
        编写消息
      </label>
      <textarea
        id='workbench-composer-input'
        data-testid='composer-input'
        className='min-h-20 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
        placeholder='输入消息（仅本地草稿，不会发送到 Runtime）…'
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (notice) setNotice(null)
        }}
        rows={3}
      />
      <div className='mt-2 flex items-center justify-between gap-3'>
        <p
          id={noticeId}
          className='min-h-5 flex-1 text-xs text-muted-foreground'
          data-testid='composer-notice'
          role='status'
          aria-live='polite'
        >
          {notice ?? '提交已禁用：无 Agent Runtime（静态 fixture）'}
        </p>
        <Button
          type='button'
          data-testid='composer-submit'
          aria-describedby={noticeId}
          disabled={!text.trim()}
          onClick={() => {
            // Local explanatory notice only — does not pretend to call a Runtime.
            setNotice(disabledReason)
          }}
        >
          发送（本地说明）
        </Button>
      </div>
    </div>
  )
}
