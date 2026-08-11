import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAuthBindingStore,
  oauthKeychainAccount,
  pluginAuthKeychainAccount,
  type SecretStore,
} from './secret-store.js'
import { revokeAuthResource } from './revoke-auth-resource.js'

describe('revokeAuthResource', () => {
  it('revokes the descriptor resource first and clears deterministic Keychain accounts', async () => {
    const bindingStore = createAuthBindingStore([
      {
        pluginId: 'plugin.example',
        resourceId: 'account',
        kind: 'oauth2',
        secretRef: {
          backend: 'keychain',
          account: oauthKeychainAccount(
            'plugin.example',
            'account',
            'access',
          ),
        },
        oauth: {
          tokenEndpoint: 'https://example.test/oauth/token',
          clientId: 'client-id',
          refreshAccount: oauthKeychainAccount(
            'plugin.example',
            'account',
            'refresh',
          ),
        },
      },
    ])
    const cleared: string[] = []
    const secretStore: SecretStore = {
      resolve: async () => null,
      clear: async (ref) => {
        if (ref.backend === 'keychain') cleared.push(ref.account)
      },
    }

    const result = await revokeAuthResource({
      pluginId: 'plugin.example',
      resource: {
        resourceId: 'account',
        kind: 'oauth2',
      },
      bindingStore,
      secretStore,
    })

    assert.equal(bindingStore.isRevoked('plugin.example', 'account'), true)
    assert.deepEqual(
      new Set(cleared),
      new Set([
        oauthKeychainAccount('plugin.example', 'account', 'access'),
        oauthKeychainAccount('plugin.example', 'account', 'refresh'),
      ]),
    )
    assert.equal(result.needsSidecarRestart, true)
    assert.deepEqual(result.clearedResources, ['account'])
  })

  it('uses the generic host-owned account for non-OAuth auth kinds', async () => {
    const bindingStore = createAuthBindingStore()
    const cleared: string[] = []
    const secretStore: SecretStore = {
      resolve: async () => null,
      clear: async (ref) => {
        if (ref.backend === 'keychain') cleared.push(ref.account)
      },
    }

    await revokeAuthResource({
      pluginId: 'plugin.cli',
      resource: { resourceId: 'session', kind: 'cli_session' },
      bindingStore,
      secretStore,
    })

    assert.deepEqual(cleared, [
      pluginAuthKeychainAccount('plugin.cli', 'session', 'env'),
    ])
  })
})
