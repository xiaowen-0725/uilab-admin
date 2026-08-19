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

function setRef(
  ref: Ref<HTMLIFrameElement | null> | undefined,
  node: HTMLIFrameElement | null,
): void {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

/**
 * Policy seam: srcdoc iframe with sandbox + csp paired.
 * Unload clears srcdoc/src. Do not park on about:blank — Chrome can keep
 * that src across the next srcdoc assign and skip the widget handshake.
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
  const assignedRef = useRef<{ srcDoc: string; assignKey: number } | null>(null)

  useLayoutEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const prev = assignedRef.current
    const alreadyAssigned =
      prev?.srcDoc === srcDoc &&
      prev.assignKey === assignKey &&
      node.srcdoc === srcDoc
    if (!alreadyAssigned) {
      assignedRef.current = { srcDoc, assignKey }
      node.removeAttribute('src')
      node.srcdoc = srcDoc
    }
    return () => {
      // Same-node srcdoc replace must not clear first — that fires a blank
      // load, closes the MessageChannel, and the heartbeat calls the widget dead.
      if (nodeRef.current !== node) {
        assignedRef.current = null
        node.removeAttribute('srcdoc')
        node.removeAttribute('src')
      }
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
