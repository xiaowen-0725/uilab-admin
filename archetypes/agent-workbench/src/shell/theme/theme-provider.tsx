import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyDocumentTheme,
  readStoredThemePreference,
  resolveIsDark,
  syncHostNativeTheme,
  writeStoredThemePreference,
  type ThemePreference,
} from './theme-preference'

export interface ThemeContextValue {
  preference: ThemePreference
  /** Resolved dark state after system media is applied. */
  resolvedDark: boolean
  setPreference: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Workbench-owned theme controller.
 * Stays in this Archetype until a shared Foundation Theme Provider is justified.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredThemePreference()
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemPrefersDark(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolvedDark = resolveIsDark(preference, systemPrefersDark)

  useEffect(() => {
    applyDocumentTheme(resolvedDark)
  }, [resolvedDark])

  useEffect(() => {
    syncHostNativeTheme(preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    writeStoredThemePreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolvedDark, setPreference }),
    [preference, resolvedDark, setPreference]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useThemePreference must be used within ThemeProvider')
  }
  return ctx
}
