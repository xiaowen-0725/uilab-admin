import type { ReactNode } from 'react'

/**
 * Minimal providers for Phase 3. Theme/direction Foundation providers are not
 * shared yet (full Phase 2 remainder). Shell uses light token defaults.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>
}
