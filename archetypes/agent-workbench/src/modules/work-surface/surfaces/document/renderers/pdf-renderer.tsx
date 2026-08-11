import { useEffect, useState } from 'react'

export interface PdfRendererProps {
  bytes: Uint8Array
  resourceKey: string
}

/**
 * PDF preview via blob URL + iframe (no pdfjs in critical path — lazy by nature).
 * Does not claim desktop/CDP PDF tooling.
 */
export function PdfRenderer({ bytes, resourceKey }: PdfRendererProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [bytes])

  if (!url) {
    return (
      <p className='text-sm text-muted-foreground' data-testid='document-renderer-pdf'>
        正在加载 PDF…
      </p>
    )
  }

  return (
    <iframe
      title={resourceKey}
      src={url}
      className='h-full min-h-[320px] w-full flex-1 rounded-md border border-border bg-background'
      data-testid='document-renderer-pdf'
      data-resource-key={resourceKey}
    />
  )
}
