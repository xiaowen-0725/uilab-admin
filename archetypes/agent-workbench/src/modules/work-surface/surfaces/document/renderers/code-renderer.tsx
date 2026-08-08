/**
 * Read-only code preview via Shiki (lazy language load).
 * Falls back to plain pre if highlight fails.
 */
import { useEffect, useState } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'
import { cn } from '@/lib/utils'

const LIGHT_THEME = 'github-light'
const DARK_THEME = 'github-dark'

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [
        'typescript',
        'tsx',
        'javascript',
        'jsx',
        'python',
        'go',
        'rust',
        'java',
        'css',
        'html',
        'json',
        'bash',
        'yaml',
        'markdown',
        'sql',
        'text',
      ],
    })
  }
  return highlighterPromise
}

export interface CodeRendererProps {
  code: string
  language: string
  resourceKey: string
  className?: string
}

export function CodeRenderer({
  code,
  language,
  resourceKey,
  className,
}: CodeRendererProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setFailed(false)
    ;(async () => {
      try {
        const highlighter = await getHighlighter()
        const lang = highlighter.getLoadedLanguages().includes(language as never)
          ? language
          : 'text'
        const out = highlighter.codeToHtml(code, {
          lang,
          themes: {
            light: LIGHT_THEME,
            dark: DARK_THEME,
          },
          defaultColor: false,
        })
        if (!cancelled) setHtml(out)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (failed || html == null) {
    return (
      <pre
        className={cn(
          'm-0 overflow-auto font-mono text-[13px] leading-5 whitespace-pre text-foreground',
          className,
        )}
        data-testid='document-renderer-code'
        data-resource-key={resourceKey}
        data-language={language}
        data-highlight={html ? 'pending' : failed ? 'failed' : 'pending'}
      >
        {code}
      </pre>
    )
  }

  return (
    <div
      className={cn(
        'document-code overflow-auto text-[13px] leading-5 [&_pre]:m-0 [&_pre]:bg-transparent [&_code]:font-mono',
        className,
      )}
      data-testid='document-renderer-code'
      data-resource-key={resourceKey}
      data-language={language}
      data-highlight='ready'
      // Shiki dual-theme HTML is trusted as library output (no user HTML).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
