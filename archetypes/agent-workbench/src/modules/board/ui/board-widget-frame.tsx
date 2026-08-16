import {
  WIDGET_IFRAME_SANDBOX,
  buildWidgetIframeCsp,
} from '../model/widget-subdocument-policy'

export interface BoardWidgetFrameProps {
  srcDoc: string
  title?: string
}

export function readHostCspNonce(root: ParentNode = document): string {
  const meta = root.querySelector('meta[property="csp-nonce"]')
  const nonce = meta?.getAttribute('nonce')?.trim()
  if (!nonce) {
    throw new Error('宿主 CSP nonce 缺失')
  }
  return nonce
}

/**
 * Board widget rendering point: srcdoc iframe with sandbox + csp paired.
 * Full host chrome / bridge is a later ticket; this frame is the policy seam.
 */
export function BoardWidgetFrame({
  srcDoc,
  title = '看板小组件',
}: BoardWidgetFrameProps) {
  const nonce = readHostCspNonce()
  return (
    <iframe
      title={title}
      sandbox={WIDGET_IFRAME_SANDBOX}
      // @ts-expect-error React DOM types omit iframe csp= (CSP Embedded Enforcement)
      csp={buildWidgetIframeCsp(nonce)}
      srcDoc={srcDoc}
      data-testid='board-widget-frame'
    />
  )
}
