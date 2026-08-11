import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILTIN_CONNECTOR_DESCRIPTORS,
  BUILTIN_MCP_GITHUB_PLUGIN,
  CONNECTOR_GITHUB_ID,
} from '../plugin/builtins.js'
import {
  createAuthBindingStore,
  oauthKeychainAccount,
  type SecretStore,
} from '../plugin/secret-store.js'
import { createConnectorOAuthRuntime } from './connector-oauth.js'

describe('Managed Connector OAuth runtime', () => {
  it('creates one-click authorization and claims tokens without local Provider credentials', async () => {
    const keychain = new Map<string, string>()
    const secretStore: SecretStore = {
      async resolve(ref) {
        return ref.backend === 'keychain'
          ? (keychain.get(ref.account) ?? null)
          : null
      },
      async set(ref, value) {
        if (ref.backend === 'keychain') keychain.set(ref.account, value)
      },
      async clear(ref) {
        if (ref.backend === 'keychain') keychain.delete(ref.account)
      },
    }
    let claimCount = 0
    let now = 1_800_000_000_000
    const requests: Array<{
      url: string
      method?: string
      authorization?: string
      body?: string
    }> = []
    const fetchImpl = async (input: string, init?: RequestInit) => {
      requests.push({
        url: input,
        method: init?.method,
        authorization:
          new Headers(init?.headers).get('authorization') ?? undefined,
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      if (input === 'https://connectors.uilab.test/v1/oauth/sessions') {
        return response(201, {
          session_id: 'broker-session-1',
          authorization_url:
            'https://github.com/login/oauth/authorize?client_id=uilab-connector&state=broker-state',
          claim_token: 'sidecar-only-claim-token',
          token_endpoint: 'https://connectors.uilab.test/v1/oauth/token',
          client_id: 'uilab-agent-workbench',
          expires_in: 900,
          poll_interval: 1,
        })
      }
      if (
        input ===
        'https://connectors.uilab.test/v1/oauth/sessions/broker-session-1/claim'
      ) {
        claimCount += 1
        assert.equal(
          new Headers(init?.headers).get('authorization'),
          'Bearer sidecar-only-claim-token',
        )
        if (claimCount === 1) return response(202, { status: 'pending' })
        return response(200, {
          status: 'authorized',
          access_token: 'github-user-access',
          refresh_token: 'broker-refresh-handle',
          token_type: 'bearer',
          expires_in: 28_800,
        })
      }
      throw new Error(`unexpected request: ${input}`)
    }
    const runtime = createConnectorOAuthRuntime({
      env: {
        UILAB_CONNECTOR_BROKER_URL: 'https://connectors.uilab.test',
      },
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      manifests: [BUILTIN_MCP_GITHUB_PLUGIN],
      secretStore,
      bindingStore: createAuthBindingStore(),
      fetchImpl,
      now: () => now,
    })

    const started = await runtime.begin(CONNECTOR_GITHUB_ID)
    assert.match(
      started.authorizationUrl,
      /^https:\/\/github\.com\/login\/oauth\/authorize/,
    )
    assert.equal(started.expiresIn, 900)
    assert.equal(JSON.stringify(started).includes('claim_token'), false)
    assert.equal(JSON.stringify(started).includes('sidecar-only'), false)

    assert.deepEqual(await runtime.reconcile(), [])
    now += 1_000
    const completed = await runtime.reconcile()
    assert.equal(completed.length, 1)
    assert.equal(completed[0]?.connectorId, CONNECTOR_GITHUB_ID)
    assert.equal(completed[0]?.pluginId, 'mcp.github')
    assert.doesNotMatch(
      JSON.stringify(completed),
      /github-user-access|broker-refresh-handle|sidecar-only-claim-token/,
    )
    assert.equal(
      await secretStore.resolve({
        backend: 'keychain',
        account: oauthKeychainAccount('mcp.github', 'mcp:github', 'access'),
      }),
      'github-user-access',
    )
    assert.equal(
      await secretStore.resolve({
        backend: 'keychain',
        account: oauthKeychainAccount('mcp.github', 'mcp:github', 'refresh'),
      }),
      'broker-refresh-handle',
    )

    const startBody = JSON.parse(requests[0]?.body ?? '{}')
    assert.equal(startBody.provider, 'github')
    assert.equal(startBody.connector_id, CONNECTOR_GITHUB_ID)
    assert.equal('client_secret' in startBody, false)
    assert.equal('pat' in startBody, false)
  })

  it('fails honestly when the platform Connector Broker is not deployed', async () => {
    const runtime = createConnectorOAuthRuntime({
      env: {},
      descriptors: BUILTIN_CONNECTOR_DESCRIPTORS,
      manifests: [BUILTIN_MCP_GITHUB_PLUGIN],
      secretStore: { resolve: async () => null },
      bindingStore: createAuthBindingStore(),
    })

    await assert.rejects(
      () => runtime.begin(CONNECTOR_GITHUB_ID),
      /平台「GitHub」连接服务尚未配置/,
    )
    await assert.rejects(
      () => runtime.begin(CONNECTOR_GITHUB_ID),
      (error: Error) => !/CLIENT_SECRET|PAT/.test(error.message),
    )
  })
})

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}
