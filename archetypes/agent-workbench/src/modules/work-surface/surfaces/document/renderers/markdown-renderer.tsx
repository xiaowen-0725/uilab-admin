/**
 * Document Markdown — same Streamdown plugins as Timeline prose.
 * One sanitizer whitelist; do not fork `{ cjk, code }` or a second renderer map.
 */
import { Streamdown } from 'streamdown'
import { workbenchMarkdownPlugins } from '@/modules/task'
import 'streamdown/styles.css'

export interface MarkdownRendererProps {
  source: string
  resourceKey: string
}

export function MarkdownRenderer({
  source,
  resourceKey,
}: MarkdownRendererProps) {
  return (
    <div
      className='document-md text-[14px] leading-[22px] text-foreground [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'
      data-testid='document-renderer-markdown'
      data-resource-key={resourceKey}
    >
      <Streamdown
        className='size-full'
        plugins={workbenchMarkdownPlugins}
        isAnimating={false}
        mode='static'
        controls={false}
        lineNumbers={false}
        parseIncompleteMarkdown
      >
        {source}
      </Streamdown>
    </div>
  )
}
