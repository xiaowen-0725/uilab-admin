/** Workbench-local theme preference — not a Foundation Theme Provider. */
export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'uilab-workbench-theme'

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
] as const

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(raw)) return raw
  } catch {
    // private mode / blocked storage — keep system default
  }
  return 'system'
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // ignore quota / private mode failures
  }
}

/** Resolve preference to whether the document should use dark tokens. */
export function resolveIsDark(
  preference: ThemePreference,
  systemPrefersDark: boolean
): boolean {
  if (preference === 'dark') return true
  if (preference === 'light') return false
  return systemPrefersDark
}

/** Apply or remove the root `.dark` class used by Foundation tokens. */
export function applyDocumentTheme(isDark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
}

/** Ask Desktop Host to retarget macOS vibrancy. No-op in Web / tests. */
export function syncHostNativeTheme(preference: ThemePreference): void {
  if (typeof window === 'undefined') return
  const host = window.__workbenchHost
  if (!host || typeof host.setNativeTheme !== 'function') return
  void host.setNativeTheme(preference)
}
