export interface TextRendererProps {
  text: string
  resourceKey: string
}

/** Read-only plain text / structured text preview. */
export function TextRenderer({ text, resourceKey }: TextRendererProps) {
  return (
    <pre
      className='m-0 overflow-auto font-mono text-[13px] leading-5 whitespace-pre-wrap text-foreground'
      data-testid='document-renderer-text'
      data-resource-key={resourceKey}
    >
      {text}
    </pre>
  )
}
