/**
 * Sidecar plugin kernel public surface (#18 SecurityPolicy, #19 Registry).
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

export type {
  McpContribution,
  McpServerConfigShape,
  PluginContributes,
  PluginKind,
  PluginManifest,
} from './manifest.js'

export { BUILTIN_PLUGINS, BUILTIN_MCP_CALENDAR_PLUGIN, BUILTIN_MCP_DOCS_PLUGIN } from './builtins.js'

export {
  createPluginRegistry,
  formatRegistryMcpStatusLine,
  type CreatePluginRegistryOptions,
  type PluginLoadStatus,
  type PluginRegistry,
  type PluginRegistryLoadResult,
  type PluginRuntimeRecord,
} from './registry.js'

