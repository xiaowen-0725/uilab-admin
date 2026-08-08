/**
 * DOCX read-only preview — mammoth is dynamically imported (lazy, A7).
 * Classic .doc is rejected upstream as unsupported.
 */
import { useEffect, useState } from 'react'

export interface DocxRendererProps {
  bytes: Uint8Array
  resourceKey: string
  onFailed?: () => void
}

export function DocxRenderer({
  bytes,
  resourceKey,
  onFailed,
}: DocxRendererProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(false)
    ;(async () => {
      try {
        const mammoth = await import('mammoth')
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer
        const result = await mammoth.convertToHtml({ arrayBuffer })
        if (cancelled) return
        setHtml(result.value || '<p></p>')
      } catch {
        if (!cancelled) {
          setError(true)
          onFailed?.()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bytes, onFailed])

  if (error) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-testid='document-renderer-docx'
        data-state='failed'
      >
        Word 文档渲染失败。
      </p>
    )
  }

  if (html == null) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-testid='document-renderer-docx'
      >
        正在加载 Word 文档…
      </p>
    )
  }

  return (
    <div
      className='document-docx prose prose-sm dark:prose-invert max-w-none text-[14px] leading-[22px]'
      data-testid='document-renderer-docx'
      data-resource-key={resourceKey}
      // mammoth HTML is library-sanitized conversion output (read-only preview).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
