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

/**
 * Whether the project default layout keeps the sidebar open.
 * Derived from `adminPreferenceDefaults.layout` so CLI `set-shell` remains the single source of truth.
 * - `default` → open
 * - `compact` / `full` → closed (collapsible mode comes from layout-provider)
 */
export const defaultSidebarOpen =
  adminPreferenceDefaults.layout === 'default'

/**
 * Resolve initial sidebar open state from the `sidebar_state` cookie.
 * - Cookie absent → project default (`defaultSidebarOpen`)
 * - Cookie present → honor saved `true` / `false` (any non-`false` value is open)
 */
export function resolveSidebarDefaultOpen(
  sidebarStateCookie: string | undefined
): boolean {
  if (sidebarStateCookie === undefined) {
    return defaultSidebarOpen
  }
  return sidebarStateCookie !== 'false'
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
