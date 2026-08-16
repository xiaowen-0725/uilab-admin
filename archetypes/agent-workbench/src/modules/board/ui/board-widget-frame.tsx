import { useLayoutEffect, useRef, type Ref } from 'react'
import {
  WIDGET_IFRAME_SANDBOX,
  buildWidgetIframeCsp,
} from '../model/widget-subdocument-policy'

export interface BoardWidgetFrameProps {
  srcDoc: string
  title?: string
  className?: string
  /** Re-assigning srcdoc navigates even when the string is unchanged. */
  assignKey?: number
  onLoad?: () => void
  iframeRef?: Ref<HTMLIFrameElement | null>
}

export function readHostCspNonce(): string {
  const meta = document.querySelector('meta[property="csp-nonce"]')
  const nonce = meta?.getAttribute('nonce')?.trim()
  if (!nonce) {
    throw new Error('宿主 CSP nonce 缺失')
  }
  return nonce
}

function setRef(ref: Ref<HTMLIFrameElement | null> | undefined, node: HTMLIFrameElement | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

/**
 * Policy seam: srcdoc iframe with sandbox + csp paired.
 * Unload uses about:blank; the next srcdoc assign removes src first.
 */
export function BoardWidgetFrame({
  srcDoc,
  title = '看板小组件',
  className,
  assignKey = 0,
  onLoad,
  iframeRef,
}: BoardWidgetFrameProps) {
  const nonce = readHostCspNonce()
  const nodeRef = useRef<HTMLIFrameElement | null>(null)

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node) return
    node.removeAttribute('src')
    node.srcdoc = srcDoc
    return () => {
      node.src = 'about:blank'
    }
  }, [srcDoc, assignKey])

  function bindIframe(node: HTMLIFrameElement | null) {
    nodeRef.current = node
    setRef(iframeRef, node)
  }

  return (
    <iframe
      ref={bindIframe}
      title={title}
      sandbox={WIDGET_IFRAME_SANDBOX}
      // @ts-expect-error React DOM types omit iframe csp= (CSP Embedded Enforcement)
      csp={buildWidgetIframeCsp(nonce)}
      referrerPolicy='no-referrer'
      className={className}
      data-testid='board-widget-frame'
      onLoad={onLoad}
    />
  )
}
