import type { ReactNode } from 'react'

/**
 * App-level providers.
 * Theme lives on the Composition Root (`WorkbenchApp`) so browser tests that
 * render WorkbenchApp directly still resolve theme context. Do not expand
 * Foundation Theme API from here without dual-Archetype justification.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>
}
