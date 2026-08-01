export type AdminTheme = "system" | "light" | "dark"
export type SidebarVariant = "inset" | "floating" | "sidebar"
export type LayoutMode = "default" | "compact" | "full"
export type TextDirection = "ltr" | "rtl"
export type SidebarCollapsible = "offcanvas" | "icon" | "none"

/**
 * Project-level defaults for shell appearance.
 * Change this file when a new app wants a different default shell.
 * Runtime user tweaks are stored separately and only override these defaults.
 */
export type AdminPreferences = {
  theme: AdminTheme
  sidebar: SidebarVariant
  layout: LayoutMode
  direction: TextDirection
}

export const adminPreferenceDefaults: AdminPreferences = {
  theme: "system",
  sidebar: "inset",
  layout: "default",
  direction: "ltr",
}

export const ADMIN_PREFERENCES_STORAGE_KEY = "uilab-admin.preferences"

export function layoutModeToCollapsible(
  layout: LayoutMode
): SidebarCollapsible {
  if (layout === "compact") return "icon"
  if (layout === "full") return "offcanvas"
  return "icon"
}

export function layoutModeToSidebarOpen(layout: LayoutMode): boolean {
  return layout === "default"
}

export function preferencesToJson(preferences: AdminPreferences): string {
  return JSON.stringify(preferences, null, 2)
}

export function preferencesToConfigSnippet(
  preferences: AdminPreferences
): string {
  return `import type { AdminPreferences } from "@/config/admin-preferences"

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
    "把当前 uilab-admin 项目的默认布局设为：",
    `- theme: ${preferences.theme}`,
    `- sidebar: ${preferences.sidebar}`,
    `- layout: ${preferences.layout}`,
    `- direction: ${preferences.direction}`,
    "",
    "请写入 `src/config/admin-preferences.ts` 的 `adminPreferenceDefaults`，",
    "并确保 LayoutProvider / ThemeProvider / DirectionProvider 以它为 defaults。",
    "不要改用户运行时 localStorage 覆盖逻辑。",
  ].join("\n")
}

export function parseStoredPreferences(
  raw: string | null
): Partial<AdminPreferences> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AdminPreferences>
    return sanitizePreferences(parsed)
  } catch {
    return null
  }
}

export function sanitizePreferences(
  input: Partial<AdminPreferences> | null | undefined
): Partial<AdminPreferences> {
  if (!input) return {}

  const next: Partial<AdminPreferences> = {}
  if (input.theme === "system" || input.theme === "light" || input.theme === "dark") {
    next.theme = input.theme
  }
  if (
    input.sidebar === "inset" ||
    input.sidebar === "floating" ||
    input.sidebar === "sidebar"
  ) {
    next.sidebar = input.sidebar
  }
  if (
    input.layout === "default" ||
    input.layout === "compact" ||
    input.layout === "full"
  ) {
    next.layout = input.layout
  }
  if (input.direction === "ltr" || input.direction === "rtl") {
    next.direction = input.direction
  }
  return next
}

export function resolvePreferences(
  overrides: Partial<AdminPreferences> = {}
): AdminPreferences {
  return {
    ...adminPreferenceDefaults,
    ...sanitizePreferences(overrides),
  }
}
