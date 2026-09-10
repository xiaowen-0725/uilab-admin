/**
 * Streamdown plugin / renderer config shared by Timeline and Document.
 * One sanitizer whitelist; callers must not fork a second allowlist.
 */

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import type { PluginConfig } from 'streamdown'
import { SvgFenceRenderer } from './svg-fence-renderer'

export const workbenchMarkdownPlugins: PluginConfig = {
  cjk,
  code: code as PluginConfig['code'],
  renderers: [
    {
      language: ['svg', 'SVG'],
      component: SvgFenceRenderer,
    },
  ],
}
