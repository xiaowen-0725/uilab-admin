import { useEffect, useState } from 'react'

export interface ImageRendererProps {
  bytes: Uint8Array
  mimeType: string
  resourceKey: string
}

/** Read-only image preview via object URL. SVG treated as untrusted (no script via img). */
export function ImageRenderer({
  bytes,
  mimeType,
  resourceKey,
}: ImageRendererProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const blob = new Blob([bytes.slice()], { type: mimeType || 'image/png' })
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [bytes, mimeType])

  if (!url) {
    return (
      <p className='text-sm text-muted-foreground' data-testid='document-renderer-image'>
        正在准备图片…
      </p>
    )
  }

  return (
    <div
      className='flex min-h-0 flex-1 items-start justify-center overflow-auto'
      data-testid='document-renderer-image'
      data-resource-key={resourceKey}
    >
      <img
        src={url}
        alt={resourceKey}
        className='max-h-full max-w-full object-contain'
      />
    </div>
  )
}
