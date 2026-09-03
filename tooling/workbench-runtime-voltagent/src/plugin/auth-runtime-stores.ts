/**
 * Shared SecretStore + AuthBindingStore assembly for registry and operator CLI.
 * Persistence policy is one function so adversarial P1 cannot drift.
 */

import {
  createPersistedAuthBindingStore,
} from './auth-binding-persist.js'
import {
  createAuthBindingStore,
  type AuthBindingStore,
} from './auth-binding-store.js'
import {
  createDefaultSecretStore,
  type SecretStore,
} from './secret-store.js'
import type { ProfileEnv } from './types.js'

export type ResolveAuthRuntimeStoresOptions = {
  env?: ProfileEnv
  persistAuthBindings?: boolean
  secretStore?: SecretStore
  authBindingStore?: AuthBindingStore
  runtimeConfigDir?: string
  /** Test-only. Production operator / registry must omit this. */
  skipWorkspaceGuard?: boolean
}

export type ResolvedAuthRuntimeStores = {
  secretStore: SecretStore
  authBindingStore: AuthBindingStore
  persistEnabled: boolean
}

export function isAuthBindingPersistEnabled(
  persistAuthBindings: boolean | undefined,
  env: ProfileEnv,
): boolean {
  return persistAuthBindings !== false && env.UILAB_PERSIST_AUTH !== '0'
}

export async function resolveAuthRuntimeStores(
  options: ResolveAuthRuntimeStoresOptions = {},
): Promise<ResolvedAuthRuntimeStores> {
  const env = options.env ?? process.env
  const persistEnabled = isAuthBindingPersistEnabled(
    options.persistAuthBindings,
    env,
  )
  const secretStore = options.secretStore ?? createDefaultSecretStore(env)

  let authBindingStore = options.authBindingStore
  if (!authBindingStore && persistEnabled) {
    authBindingStore = await createPersistedAuthBindingStore({
      env,
      rootDir: options.runtimeConfigDir,
      skipWorkspaceGuard: options.skipWorkspaceGuard === true,
    })
  }
  if (!authBindingStore) {
    authBindingStore = createAuthBindingStore()
  }

  return { secretStore, authBindingStore, persistEnabled }
}
