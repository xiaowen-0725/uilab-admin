/**
 * Document Markdown — Streamdown + CJK/code plugins (same stack as Timeline).
 * Safe default Streamdown pipeline; no raw HTML execution path.
 */
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { Streamdown, type PluginConfig } from 'streamdown'
import 'streamdown/styles.css'

const streamPlugins: PluginConfig = {
  cjk,
  code: code as PluginConfig['code'],
}

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
        plugins={streamPlugins}
        isAnimating={false}
        mode='static'
        controls={false}
      >
        {source}
      </Streamdown>
    </div>
  )
}
