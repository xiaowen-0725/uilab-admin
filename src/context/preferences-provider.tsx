import * as React from "react"
import {
  ADMIN_PREFERENCES_STORAGE_KEY,
  adminPreferenceDefaults,
  layoutModeToCollapsible,
  layoutModeToSidebarOpen,
  parseStoredPreferences,
  resolvePreferences,
  type AdminPreferences,
  type LayoutMode,
  type SidebarCollapsible,
  type SidebarVariant,
  type TextDirection,
  type AdminTheme,
} from "@/config/admin-preferences"
import { useTheme } from "@/components/theme-provider"
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@/lib/storage"

type PreferencesContextValue = {
  defaults: AdminPreferences
  preferences: AdminPreferences
  setThemePreference: (theme: AdminTheme) => void
  setSidebarVariant: (sidebar: SidebarVariant) => void
  setLayoutMode: (layout: LayoutMode) => void
  setDirection: (direction: TextDirection) => void
  resetPreferences: () => void
  // derived shell fields
  sidebarVariant: SidebarVariant
  collapsible: SidebarCollapsible
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  direction: TextDirection
}

const PreferencesContext =
  React.createContext<PreferencesContextValue | null>(null)

function readOverrides(): Partial<AdminPreferences> {
  return (
    parseStoredPreferences(readLocalStorage(ADMIN_PREFERENCES_STORAGE_KEY)) ??
    {}
  )
}

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { setTheme } = useTheme()
  const [overrides, setOverrides] = React.useState<Partial<AdminPreferences>>(
    () => readOverrides()
  )
  const preferences = React.useMemo(
    () => resolvePreferences(overrides),
    [overrides]
  )

  const persist = React.useCallback((next: Partial<AdminPreferences>) => {
    setOverrides(next)
    if (Object.keys(next).length === 0) {
      removeLocalStorage(ADMIN_PREFERENCES_STORAGE_KEY)
      return
    }
    writeLocalStorage(
      ADMIN_PREFERENCES_STORAGE_KEY,
      JSON.stringify(next)
    )
  }, [])

  const patch = React.useCallback(
    (partial: Partial<AdminPreferences>) => {
      const merged = {
        ...overrides,
        ...partial,
      }
      // Drop keys that equal project defaults so storage stays sparse.
      const cleaned: Partial<AdminPreferences> = {}
      ;(Object.keys(merged) as (keyof AdminPreferences)[]).forEach((key) => {
        const value = merged[key]
        if (value !== undefined && value !== adminPreferenceDefaults[key]) {
          cleaned[key] = value as never
        }
      })
      persist(cleaned)
    },
    [overrides, persist]
  )

  // Keep theme provider in sync with preference theme.
  React.useEffect(() => {
    setTheme(preferences.theme)
  }, [preferences.theme, setTheme])

  // Keep document direction in sync.
  React.useEffect(() => {
    document.documentElement.setAttribute("dir", preferences.direction)
  }, [preferences.direction])

  const setThemePreference = React.useCallback(
    (theme: AdminTheme) => patch({ theme }),
    [patch]
  )
  const setSidebarVariant = React.useCallback(
    (sidebar: SidebarVariant) => patch({ sidebar }),
    [patch]
  )
  const setLayoutMode = React.useCallback(
    (layout: LayoutMode) => patch({ layout }),
    [patch]
  )
  const setDirection = React.useCallback(
    (direction: TextDirection) => patch({ direction }),
    [patch]
  )
  const resetPreferences = React.useCallback(() => {
    persist({})
    setTheme(adminPreferenceDefaults.theme)
  }, [persist, setTheme])

  // Controlled open state derived from layout mode, still toggleable by user.
  const [sidebarOpen, setSidebarOpen] = React.useState(() =>
    layoutModeToSidebarOpen(preferences.layout)
  )

  React.useEffect(() => {
    setSidebarOpen(layoutModeToSidebarOpen(preferences.layout))
  }, [preferences.layout])

  const value = React.useMemo<PreferencesContextValue>(
    () => ({
      defaults: adminPreferenceDefaults,
      preferences,
      setThemePreference,
      setSidebarVariant,
      setLayoutMode,
      setDirection,
      resetPreferences,
      sidebarVariant: preferences.sidebar,
      collapsible: layoutModeToCollapsible(preferences.layout),
      sidebarOpen,
      setSidebarOpen,
      direction: preferences.direction,
    }),
    [
      preferences,
      setThemePreference,
      setSidebarVariant,
      setLayoutMode,
      setDirection,
      resetPreferences,
      sidebarOpen,
    ]
  )

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = React.useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider")
  }
  return context
}
