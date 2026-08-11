/**
 * Revoke one manifest-declared auth resource for a Connector Surface action.
 * Generic by plugin/resource descriptor; never branches on Provider identity.
 */
import type { AuthResourceContribution } from './manifest.js'
import {
  oauthKeychainAccount,
  pluginAuthKeychainAccount,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'

export type RevokeAuthResourceResult = {
  clearedResources: string[]
  needsSidecarRestart: boolean
}

export async function revokeAuthResource(input: {
  pluginId: string
  resource: AuthResourceContribution
  bindingStore: AuthBindingStore
  secretStore: SecretStore
}): Promise<RevokeAuthResourceResult> {
  const { pluginId, resource, bindingStore, secretStore } = input
  const existing = bindingStore.get(pluginId, resource.resourceId)
  const accounts = new Set<string>()

  if (existing?.secretRef?.backend === 'keychain') {
    accounts.add(existing.secretRef.account)
  }
  if (existing?.oauth?.refreshAccount) {
    accounts.add(existing.oauth.refreshAccount)
  }
  if (resource.kind === 'oauth2') {
    accounts.add(oauthKeychainAccount(pluginId, resource.resourceId, 'access'))
    accounts.add(
      oauthKeychainAccount(pluginId, resource.resourceId, 'refresh'),
    )
  } else {
    accounts.add(
      pluginAuthKeychainAccount(pluginId, resource.resourceId, 'env'),
    )
  }

  // Revoke first so concurrent refresh/login cannot reopen the dispatch gate.
  bindingStore.clear(pluginId, resource.resourceId)

  const failures: string[] = []
  if (secretStore.clear) {
    for (const account of accounts) {
      try {
        await secretStore.clear({ backend: 'keychain', account })
      } catch (cause) {
        failures.push(
          `${account}: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`binding 已撤销，但 Keychain 清理失败：${failures.join('; ')}`)
  }

  return {
    clearedResources: [resource.resourceId],
    // Live host gates revoke immediately; already-open MCP transports may hold bytes.
    needsSidecarRestart: true,
  }
}
