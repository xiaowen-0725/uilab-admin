/**
 * Closed mermaid fences compile once, then reuse the SVG figure frame.
 * Incomplete fences stay code and never call mermaid.render().
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  useIsCodeFenceIncomplete,
  type CustomRendererProps,
} from 'streamdown'
import { compileMermaidFence } from '@/lib/inline-figure/compile-mermaid-svg'
import {
  sanitizeInlineSvg,
  type SanitizeInlineSvgResult,
} from '@/lib/inline-figure/sanitize-inline-svg'
import { InlineFigureFallback, InlineFigureView } from './inline-figure-view'

export function MermaidFenceRenderer({
  code,
  isIncomplete,
  language,
}: CustomRendererProps): ReactNode {
  const fenceIncomplete = useIsCodeFenceIncomplete()
  const incomplete = isIncomplete || fenceIncomplete
  const themeKey = useDocumentThemeKey()
  const [result, setResult] = useState<SanitizeInlineSvgResult>({ ok: false })

  useEffect(() => {
    if (incomplete) {
      setResult({ ok: false })
      return
    }
    let cancelled = false
    async function compile() {
      try {
        const svg = await compileMermaidFence(code)
        if (cancelled) return
        setResult(svg == null ? { ok: false } : sanitizeInlineSvg(svg))
      } catch {
        if (!cancelled) setResult({ ok: false })
      }
    }
    void compile()
    return () => {
      cancelled = true
    }
  }, [code, incomplete, themeKey])

  if (incomplete || !result.ok) {
    return (
      <InlineFigureFallback
        code={code}
        language={language || 'mermaid'}
        incomplete={incomplete}
      />
    )
  }

  return <InlineFigureView root={result.root} titleText={result.titleText} />
}

function useDocumentThemeKey(): string {
  const [key, setKey] = useState(document.documentElement.className)
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setKey(root.className))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return key
}
