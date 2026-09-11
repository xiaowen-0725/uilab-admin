/**
 * Inline SVG fence renderer — shallow frame, SVG-namespace React nodes.
 * Incomplete / sanitize failure fall back to Streamdown CodeBlock.
 */

import { useMemo, type ReactNode } from 'react'
import {
  useIsCodeFenceIncomplete,
  type CustomRendererProps,
} from 'streamdown'
import {
  sanitizeInlineSvg,
  type SanitizeInlineSvgResult,
} from '@/lib/inline-figure/sanitize-inline-svg'
import { InlineFigureFallback, InlineFigureView } from './inline-figure-view'

export function SvgFenceRenderer({
  code,
  isIncomplete,
  language,
}: CustomRendererProps): ReactNode {
  const fenceIncomplete = useIsCodeFenceIncomplete()
  const incomplete = isIncomplete || fenceIncomplete
  const result = useMemo((): SanitizeInlineSvgResult => {
    if (incomplete) return { ok: false }
    return sanitizeInlineSvg(code)
  }, [code, incomplete])

  if (incomplete || !result.ok) {
    return (
      <InlineFigureFallback
        code={code}
        language={language || 'svg'}
        incomplete={incomplete}
      />
    )
  }

  return <InlineFigureView root={result.root} titleText={result.titleText} />
}
