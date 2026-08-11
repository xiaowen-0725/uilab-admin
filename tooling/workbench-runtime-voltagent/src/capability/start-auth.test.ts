import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONNECTOR_GITHUB_DESCRIPTOR,
  CONNECTOR_GITHUB_ID,
} from '../plugin/builtins.js'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import { startConnectorAuth } from './start-auth.js'

const demoCliDescriptor: ConnectorDescriptor = {
  id: 'connector.demo-cli',
  name: 'Demo CLI',
  description: 'Provider-neutral CLI connector fixture',
  pluginRefs: ['cli.demo'],
  capabilities: [],
  authSummarySource: {
    kind: 'cli_session',
    pluginId: 'cli.demo',
    resourceId: 'cli:demo',
  },
  primaryChannel: 'domain_cli',
  commandScopes: ['demo-cli'],
  toolScope: [],
  availability: 'sidecar',
  loginHint: '连接 Demo CLI',
}

describe('startConnectorAuth', () => {
  it('starts platform-managed OAuth and returns only a browser URL', async () => {
    const result = await startConnectorAuth(
      { connectorId: CONNECTOR_GITHUB_ID },
      {
        descriptors: [CONNECTOR_GITHUB_DESCRIPTOR],
        beginOAuth: async ({ connectorId }) => {
          assert.equal(connectorId, CONNECTOR_GITHUB_ID)
          return {
            authorizationUrl:
              'https://github.com/login/oauth/authorize?client_id=client-1&state=state-1&code_challenge=challenge-1',
            expiresIn: 900,
          }
        },
      },
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.kind, 'oauth2')
      assert.equal(result.phase, 'login_started')
      assert.match(
        result.verificationUrl ?? '',
        /^https:\/\/github\.com\/login\/oauth\/authorize/,
      )
      assert.match(result.message, /GitHub|一键授权/)
      assert.equal(JSON.stringify(result).includes('client_secret'), false)
      assert.equal(JSON.stringify(result).includes('access_token'), false)
    }
  })

  it('fails honestly when the platform Connector Broker is unavailable', async () => {
    const result = await startConnectorAuth(
      { connectorId: CONNECTOR_GITHUB_ID },
      { descriptors: [CONNECTOR_GITHUB_DESCRIPTOR] },
    )

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, 'oauth_unavailable')
      assert.match(result.message, /平台.*连接服务/)
    }
  })

  it('delegates every CLI session flow to the Provider-declared runtime', async () => {
    const result = await startConnectorAuth(
      { connectorId: demoCliDescriptor.id, domains: ['docs'] },
      {
        descriptors: [demoCliDescriptor],
        beginCliSession: async ({ connectorId, descriptor, domains }) => {
          assert.equal(connectorId, demoCliDescriptor.id)
          assert.equal(descriptor, demoCliDescriptor)
          assert.deepEqual(domains, ['docs'])
          return {
            phase: 'authorization_required',
            step: 'configure',
            authorizationUrl:
              'https://connect.demo.test/page/cli?user_code=demo',
            message: '请配置 Demo CLI。',
          }
        },
      },
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.kind, 'cli_session')
      assert.equal(result.phase, 'login_started')
      assert.equal(result.step, 'configure')
      assert.match(result.verificationUrl ?? '', /connect\.demo\.test/)
      assert.equal(JSON.stringify(result).includes('deviceCode'), false)
      assert.equal(JSON.stringify(result).includes('device_code'), false)
    }
  })

  it('passes through an already-connected CLI result without starting Provider commands itself', async () => {
    const result = await startConnectorAuth(
      { connectorId: demoCliDescriptor.id },
      {
        descriptors: [demoCliDescriptor],
        beginCliSession: async () => ({
          phase: 'already_connected',
          step: 'connected',
          message: 'Demo CLI 已连接。',
        }),
      },
    )

    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.phase, 'already_connected')
  })

  it('reports a generic CLI runtime failure without Provider branches', async () => {
    const result = await startConnectorAuth(
      { connectorId: demoCliDescriptor.id },
      {
        descriptors: [demoCliDescriptor],
        beginCliSession: async () => {
          throw new Error('CLI 版本不满足要求：需要 >= 9.0.0')
        },
      },
    )

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, 'cli_start_failed')
      assert.match(result.message, /Demo CLI.*9\.0\.0/)
    }
  })
})
