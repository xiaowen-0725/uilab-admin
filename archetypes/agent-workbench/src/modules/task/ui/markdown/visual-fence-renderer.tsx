/**
 * Closed visual fences become a host-chrome HTML island.
 * Incomplete / oversized / empty fences stay code and never build srcdoc.
 */

import { type ReactNode } from 'react'
import {
  useIsCodeFenceIncomplete,
  type CustomRendererProps,
} from 'streamdown'
import {
  extractInlineVisualTitle,
  isInlineVisualSourceTooLarge,
  peelVisualFragment,
} from '@/lib/inline-visual/build-inline-visual-document'
import { InlineFigureFallback } from './inline-figure-view'
import { InlineVisualView } from './inline-visual-view'

export function VisualFenceRenderer({
  code,
  isIncomplete,
  language,
  meta,
}: CustomRendererProps): ReactNode {
  const fenceIncomplete = useIsCodeFenceIncomplete()
  const incomplete = isIncomplete || fenceIncomplete
  const fragment = peelVisualFragment(code)

  if (incomplete || !fragment || isInlineVisualSourceTooLarge(code)) {
    return (
      <InlineFigureFallback
        code={code}
        language={language || 'visual'}
        incomplete={incomplete}
      />
    )
  }

  return (
    <InlineVisualView
      html={code}
      title={extractInlineVisualTitle(code, meta)}
    />
  )
}
