/** Shared env list parsing (JSON array or comma-separated). */

export function parseEnvStringList(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined
  const t = raw.trim()
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed
      }
    } catch {
      // fall through
    }
  }
  return t.split(',').map((s) => s.trim()).filter(Boolean)
}

export function firstEnv(
  env: Record<string, string | undefined>,
  names: string[] | undefined,
): string | undefined {
  if (!names) return undefined
  for (const name of names) {
    const v = env[name]?.trim()
    if (v) return v
  }
  return undefined
}
