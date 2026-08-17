/**
 * Shared auth surface for sidecar tool-adjacent HTTP.
 * Same credential check that POST /tools/:name/execute should use (#131).
 * This ticket does not close that existing hole; new board routes must not
 * add another unauthenticated read channel (#130 / #131).
 */

export const SIDECAR_HTTP_TOKEN_ENV = [
  'UILAB_SIDECAR_TOKEN',
  'VOLTAGENT_AUTH_TOKEN',
] as const

export type SidecarHttpAuthInput = {
  authorization?: string | null
  token?: string | null
}

export function resolveSidecarHttpToken(
  env: Record<string, string | undefined> = process.env,
  override?: string | null,
): string | null {
  if (typeof override === 'string' && override.trim()) return override.trim()
  for (const key of SIDECAR_HTTP_TOKEN_ENV) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return null
}

export function readBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i)
  return match?.[1] ?? null
}

export function authorizeSidecarToolSurface(input: SidecarHttpAuthInput): boolean {
  const expected = input.token?.trim()
  if (!expected) return false
  const presented = readBearerToken(input.authorization)
  return presented === expected
}
