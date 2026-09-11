/**
 * Host chrome + opaque srcdoc iframe for a closed visual fence.
 * Height comes from a host-owned postMessage reporter; no widget handshake.
 */

import { ChevronDownIcon as ChevronDown } from '@heroicons/react/24/outline'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CHILD_IFRAME_SANDBOX,
  buildChildIframeCsp,
} from '@/lib/html-island/child-iframe-policy'
import {
  INLINE_VISUAL_MAX_HEIGHT,
  INLINE_VISUAL_RESIZE_TYPE,
  buildInlineVisualDocument,
} from '@/lib/inline-visual/build-inline-visual-document'
import { cn } from '@/lib/utils'

export function readHostCspNonce(): string {
  const meta = document.querySelector('meta[property="csp-nonce"]')
  const nonce = meta?.getAttribute('nonce')?.trim()
  if (!nonce) {
    throw new Error('宿主 CSP nonce 缺失')
  }
  return nonce
}

type InlineVisualViewProps = {
  html: string
  title: string
}

export function InlineVisualView({
  html,
  title,
}: InlineVisualViewProps) {
  const nonce = readHostCspNonce()
  const srcDoc = useMemo(
    () => buildInlineVisualDocument({ html, nonce }),
    [html, nonce],
  )
  const nodeRef = useRef<HTMLIFrameElement | null>(null)
  const assignedRef = useRef<string | null>(null)
  const [height, setHeight] = useState(160)
  const [open, setOpen] = useState(true)

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node || !open) return
    if (assignedRef.current !== srcDoc || node.srcdoc !== srcDoc) {
      assignedRef.current = srcDoc
      node.removeAttribute('src')
      node.srcdoc = srcDoc
    }
    return () => {
      if (nodeRef.current !== node) {
        assignedRef.current = null
        node.removeAttribute('srcdoc')
        node.removeAttribute('src')
      }
    }
  }, [open, srcDoc])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== nodeRef.current?.contentWindow) return
      const data = event.data as { type?: unknown; height?: unknown } | null
      if (!data || data.type !== INLINE_VISUAL_RESIZE_TYPE) return
      const next = Number(data.height)
      if (!Number.isFinite(next)) return
      setHeight(
        Math.min(INLINE_VISUAL_MAX_HEIGHT, Math.max(80, Math.round(next))),
      )
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div
      data-testid='inline-visual'
      className='mt-2 mb-5 w-full overflow-hidden rounded-xl border border-border bg-card'
    >
      <header className='flex items-center gap-1 border-b border-border/60 px-1.5 py-1'>
        <button
          type='button'
          className='inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
          aria-expanded={open}
          aria-label={open ? '收起行内视觉' : '展开行内视觉'}
          data-testid='inline-visual-toggle'
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              !open && '-rotate-90',
            )}
          />
        </button>
        <span className='min-w-0 truncate text-sm font-medium text-foreground'>
          {title}
        </span>
      </header>
      {open ? (
        <iframe
          ref={nodeRef}
          title={title}
          sandbox={CHILD_IFRAME_SANDBOX}
          // @ts-expect-error React DOM types omit iframe csp= (CSP Embedded Enforcement)
          csp={buildChildIframeCsp(nonce)}
          referrerPolicy='no-referrer'
          className='block w-full border-0 bg-transparent'
          style={{ height }}
          data-testid='inline-visual-frame'
        />
      ) : null}
    </div>
  )
}
