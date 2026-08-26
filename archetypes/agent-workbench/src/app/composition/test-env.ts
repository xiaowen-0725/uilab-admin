/**
 * Vite / Vitest demo-mode probe for Composition defaults.
 * Tests and Instant Demo skip IDB / HTTP sidecar ports.
 */
export function isInstantDemo(): boolean {
  return (
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITEST === true ||
    import.meta.env.VITEST === 'true'
  )
}
