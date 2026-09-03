import { useLayoutEffect, useRef } from 'react'
import {
  INTERACTIVE_IFRAME_SANDBOX,
  buildInteractiveIframeCsp,
} from './island-policy'

export interface InteractiveIslandFrameProps {
  srcDoc: string
  title?: string
  className?: string
  assignKey?: number
}

export function readHostCspNonce(): string {
  const meta = document.querySelector('meta[property="csp-nonce"]')
  const nonce = meta?.getAttribute('nonce')?.trim()
  if (!nonce) {
    throw new Error('宿主 CSP nonce 缺失')
  }
  return nonce
}

/**
 * srcdoc iframe with ADR-0021 sandbox + csp. No widget handshake.
 */
export function InteractiveIslandFrame({
  srcDoc,
  title = '交互产物',
  className,
  assignKey = 0,
}: InteractiveIslandFrameProps) {
  const nonce = readHostCspNonce()
  const nodeRef = useRef<HTMLIFrameElement | null>(null)
  const assignedRef = useRef<{ srcDoc: string; assignKey: number } | null>(
    null,
  )

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
      if (nodeRef.current !== node) {
        assignedRef.current = null
        node.removeAttribute('srcdoc')
        node.removeAttribute('src')
      }
    }
  }, [srcDoc, assignKey])

  return (
    <iframe
      ref={nodeRef}
      title={title}
      sandbox={INTERACTIVE_IFRAME_SANDBOX}
      // @ts-expect-error React DOM types omit iframe csp= (CSP Embedded Enforcement)
      csp={buildInteractiveIframeCsp(nonce)}
      referrerPolicy='no-referrer'
      className={className}
      data-testid='interactive-island-frame'
    />
  )
}
