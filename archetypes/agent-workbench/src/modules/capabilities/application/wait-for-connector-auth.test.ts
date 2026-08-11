import { describe, expect, it, vi } from 'vitest'
import type {
  CapabilityAuthRefreshResult,
  CapabilitySnapshot,
} from '../ports/capability-snapshot-port'
import { waitForConnectorAuth } from './wait-for-connector-auth'

function snapshot(connected: boolean): CapabilitySnapshot {
  return {
    version: 1,
    generatedAt: '2026-08-10T00:00:00.000Z',
    taskId: 'task-1',
    honesty: {
      runtime: 'local-sidecar',
      authBoundary: 'provider_declared',
      note: '',
    },
    connectors: [
      {
        id: 'connector.github',
        name: 'GitHub',
        description: '',
        enabled: true,
        connected,
        connectionState: connected ? 'connected' : 'auth_in_progress',
        taskSelected: false,
        capabilityEffective: false,
        reasons: [],
        capabilities: [],
        toolScope: ['github__'],
        commandScopes: [],
        effectiveToolNames: [],
        effectiveCommandScopes: [],
        primaryChannel: 'mcp',
        availability: 'sidecar',
      },
    ],
    skills: [],
    experts: [],
    selection: { connectorIds: [], skillIds: [], expertId: null },
    effectiveToolNames: [],
    effectiveCommandScopes: [],
  }
}

describe('waitForConnectorAuth', () => {
  it('continues a multi-step auth flow and waits until the connector is connected', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [
          {
            connectorId: 'connector.github',
            kind: 'cli_session',
            phase: 'authorization_required',
            step: 'authorize',
            verificationUrl: 'https://accounts.example.test/authorize',
            message: '请授权账号。',
          },
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)
    const sleep = vi.fn().mockResolvedValue(undefined)
    const onAuthorizationRequired = vi.fn()

    const connected = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep,
      maxAttempts: 3,
      onAuthorizationRequired,
    })

    expect(connected).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(onAuthorizationRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'authorize',
        verificationUrl: 'https://accounts.example.test/authorize',
      })
    )
  })

  it('does not accept a stale connected snapshot in the same refresh that requires authorization', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [
          {
            connectorId: 'connector.github',
            kind: 'cli_session',
            phase: 'authorization_required',
            step: 'authorize',
            verificationUrl: 'https://accounts.example.test/authorize',
            message: '请授权账号。',
          },
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)

    const connected = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep: async () => {},
      maxAttempts: 2,
    })

    expect(connected).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
