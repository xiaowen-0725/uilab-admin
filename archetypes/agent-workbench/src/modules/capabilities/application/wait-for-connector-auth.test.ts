import { describe, expect, it, vi } from 'vitest'
import type {
  CapabilityAuthRefreshResult,
  CapabilitySnapshot,
  ConnectorAuthTransition,
} from '../ports/capability-snapshot-port'
import {
  CONNECTOR_AUTH_MAX_ATTEMPTS,
  waitForConnectorAuth,
} from './wait-for-connector-auth'

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

function authRequired(
  verificationUrl: string,
  step: 'configure' | 'authorize' | 'connected'
): ConnectorAuthTransition {
  return {
    connectorId: 'connector.github',
    kind: 'cli_session',
    phase: 'authorization_required',
    step,
    verificationUrl,
    message: '请继续授权。',
  }
}

describe('waitForConnectorAuth', () => {
  it('continues a multi-step auth flow and waits until the connector is connected', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [
          authRequired('https://accounts.example.test/authorize', 'authorize'),
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)
    const sleep = vi.fn().mockResolvedValue(undefined)
    const onAuthorizationRequired = vi.fn()

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep,
      maxAttempts: 3,
      onAuthorizationRequired,
    })

    expect(outcome).toBe('connected')
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
          authRequired('https://accounts.example.test/authorize', 'authorize'),
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep: async () => {},
      maxAttempts: 2,
    })

    expect(outcome).toBe('connected')
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('resets the attempt budget across multiple authorization_required phase transitions', async () => {
    // Without reset, maxAttempts=3 would give up after the third poll even
    // though configure → authorize transitions prove the user is still advancing.
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [
          authRequired('https://open.example.test/configure', 'configure'),
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [
          authRequired('https://accounts.example.test/authorize', 'authorize'),
        ],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(false),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)
      .mockResolvedValueOnce({
        snapshot: snapshot(true),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult)

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep: async () => {},
      maxAttempts: 3,
      onAuthorizationRequired: async () => {},
    })

    expect(outcome).toBe('connected')
    expect(refresh).toHaveBeenCalledTimes(5)
  })

  it('gives up by total attempt budget when there is no phase transition and never connects', async () => {
    const refresh = vi.fn().mockResolvedValue({
      snapshot: snapshot(false),
      transitions: [],
    } satisfies CapabilityAuthRefreshResult)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep,
      maxAttempts: 4,
      intervalMs: 10,
    })

    expect(outcome).toBe('timeout')
    expect(refresh).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(3)
  })

  it('honours AbortSignal as an explicit cancel without treating window close as cancel', async () => {
    const controller = new AbortController()
    const refresh = vi.fn().mockImplementation(async () => {
      controller.abort()
      return {
        snapshot: snapshot(false),
        transitions: [],
      } satisfies CapabilityAuthRefreshResult
    })

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep: async () => {},
      maxAttempts: CONNECTOR_AUTH_MAX_ATTEMPTS,
      signal: controller.signal,
    })

    expect(outcome).toBe('cancelled')
  })

  it('returns failed when the sidecar reports an auth failure transition', async () => {
    const refresh = vi.fn().mockResolvedValue({
      snapshot: snapshot(false),
      transitions: [
        {
          connectorId: 'connector.github',
          kind: 'cli_session',
          phase: 'failed',
          step: 'authorize',
          message: '授权失败',
        },
      ],
    } satisfies CapabilityAuthRefreshResult)

    const outcome = await waitForConnectorAuth({
      connectorId: 'connector.github',
      refresh,
      sleep: async () => {},
      maxAttempts: 3,
    })

    expect(outcome).toBe('failed')
  })
})
