/**
 * Streamdown plugin / renderer config shared by Timeline and Document.
 * One sanitizer whitelist; callers must not fork a second allowlist.
 * Mermaid uses a custom renderer — do not pass plugins.mermaid (official UI).
 */

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import type { PluginConfig } from 'streamdown'
import { MermaidFenceRenderer } from './mermaid-fence-renderer'
import { SvgFenceRenderer } from './svg-fence-renderer'

export const workbenchMarkdownPlugins: PluginConfig = {
  cjk,
  code: code as PluginConfig['code'],
  renderers: [
    {
      language: ['svg', 'SVG'],
      component: SvgFenceRenderer,
    },
    {
      language: ['mermaid', 'Mermaid'],
      component: MermaidFenceRenderer,
    },
  ],
}
