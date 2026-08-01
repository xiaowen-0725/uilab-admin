import { useId, useState } from 'react'
import { Button } from '@uilab/foundation/ui/button'

export interface ComposerProps {
  /** Optional notice shown when the user attempts submit (local only). */
  disabledReason?: string
}

/**
 * Floating Codex-style Composer card.
 * Accepts local text only; submit does not call Agent Runtime (Phase 3 honesty).
 */
export function Composer({
  disabledReason = 'Phase 3 静态 Shell：提交不会调用 Agent Runtime',
}: ComposerProps) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = useId()

  return (
    <div
      className='pointer-events-none sticky bottom-0 z-10 shrink-0 px-4 pb-4 pt-1'
      data-slot='composer'
      data-testid='composer'
    >
      <div
        className='pointer-events-auto mx-auto w-full max-w-[var(--content-max-width)] rounded-[18px] border border-border bg-card/95 p-3 shadow-[0_8px_30px_color-mix(in_oklch,var(--foreground)_10%,transparent),0_1px_0_color-mix(in_oklch,var(--foreground)_4%,transparent)] backdrop-blur-sm'
      >
        <label className='sr-only' htmlFor='workbench-composer-input'>
          编写消息
        </label>
        <textarea
          id='workbench-composer-input'
          data-testid='composer-input'
          className='min-h-16 w-full resize-y border-0 bg-transparent px-1 py-1 text-sm outline-none ring-0 focus-visible:ring-0'
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
    </div>
  )
}
