export type AdminTheme = 'system' | 'light' | 'dark'
export type SidebarVariant = 'inset' | 'floating' | 'sidebar'
export type LayoutMode = 'default' | 'compact' | 'full'
export type TextDirection = 'ltr' | 'rtl'

/**
 * Project-level shell defaults for new apps forked from this template.
 * Runtime user tweaks still live in cookies via layout/theme/direction providers.
 */
export type AdminPreferences = {
  theme: AdminTheme
  sidebar: SidebarVariant
  layout: LayoutMode
  direction: TextDirection
}

export const adminPreferenceDefaults: AdminPreferences = {
  theme: 'system',
  sidebar: 'inset',
  layout: 'default',
  direction: 'ltr',
}

export function preferencesToJson(preferences: AdminPreferences): string {
  return JSON.stringify(preferences, null, 2)
}

export function preferencesToConfigSnippet(
  preferences: AdminPreferences
): string {
  return `import type { AdminPreferences } from '@/config/admin-preferences'

export const adminPreferenceDefaults: AdminPreferences = ${JSON.stringify(
    preferences,
    null,
    2
  )} as const
`
}

export function preferencesToAgentPrompt(
  preferences: AdminPreferences
): string {
  return [
    '把当前 uilab-admin 项目的默认布局设为：',
    `- theme: ${preferences.theme}`,
    `- sidebar: ${preferences.sidebar}`,
    `- layout: ${preferences.layout}`,
    `- direction: ${preferences.direction}`,
    '',
    '请同步到对应 provider 的 default 常量（theme/layout/direction），',
    '并更新 src/config/admin-preferences.ts 的 adminPreferenceDefaults。',
  ].join('\n')
}
