import type { CliSessionStatusPredicate } from './types.js'

export type CliSessionStatusProbeResult = {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Provider-neutral CLI session status evaluation.
 * Exit code is always required; a Provider may additionally declare one JSON
 * scalar assertion so bot/app readiness cannot impersonate user login.
 */
export function isCliSessionConnected(
  result: CliSessionStatusProbeResult,
  expectExitCode: number,
  connectedWhen?: CliSessionStatusPredicate,
): boolean {
  if (result.exitCode !== expectExitCode) return false
  if (!connectedWhen) return true
  if (connectedWhen.jsonPath.length === 0) return false

  const body = parseLastJsonObject(result.stdout)
  if (!body) return false
  let value: unknown = body
  for (const segment of connectedWhen.jsonPath) {
    if (!segment || !isRecord(value) || !(segment in value)) return false
    value = value[segment]
  }
  return value === connectedWhen.equals
}

function parseLastJsonObject(stdout: string): Record<string, unknown> | null {
  const text = stdout.trim()
  if (!text) return null
  const candidates = [
    ...text
      .split('\n')
      .map((line) => line.trim())
      .reverse(),
    text,
  ]
  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (isRecord(parsed)) return parsed
    } catch {
      // Try the next candidate; CLI update notices may precede the JSON body.
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
