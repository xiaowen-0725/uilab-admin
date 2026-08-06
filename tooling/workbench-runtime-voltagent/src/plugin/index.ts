/**
 * Sidecar plugin kernel public surface (ticket #18).
 * Registry / loaders land in follow-up tickets.
 */

export type {
  AuthBinding,
  AuthStatus,
  AuthStatusResult,
  CredentialKind,
  ProfileEnv,
  SecretRef,
} from './types.js'

export {
  CHILD_ENV_BASE_KEYS,
  decideCliCommandNeedsApproval,
  decideToolNeedsApproval,
  filterChildEnv,
  formatSafeStatusLine,
  isModelProviderSecretKey,
  normalizeToolName,
  redactSecretValues,
  type CliApprovalInput,
  type ToolApprovalInput,
} from './security-policy.js'

export {
  createAuthBindingStore,
  createCompositeSecretStore,
  createEnvSecretStore,
  createKeychainSecretStoreStub,
  createMemorySecretStore,
  resolveAuthStatus,
  type AuthBindingStore,
  type SecretStore,
} from './secret-store.js'
