/**
 * Sidecar plugin public surface — Registry, SecurityPolicy, SecretRef, loaders.
 * Office assembly uses this package only (no office-mcp / office-skills façades).
 */

export type {
  AuthBinding,
  AuthStatus,
  AuthStatusResult,
  CredentialKind,
  CredentialMaterial,
  OAuthBindingMeta,
  ProfileEnv,
  SecretRef,
} from './types.js'

export {
  beginOAuthAuthorization,
  buildAuthorizationUrl,
  completeOAuthAuthorization,
  createFakeAuthorizationServer,
  createOAuthPendingStore,
  createPkcePair,
  exchangeAuthorizationCode,
  oauthAccessAccount,
  oauthRefreshAccount,
  refreshAccessToken,
  refreshOAuthBinding,
  type FetchLike,
  type OAuthPending,
  type OAuthPendingStore,
  type OAuthTokenResponse,
  type PkcePair,
} from './oauth.js'

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
  createDefaultSecretStore,
  createEnvSecretStore,
  createKeychainSecretStore,
  createKeychainSecretStoreStub,
  createMemorySecretStore,
  migrateEnvSecretsToKeychain,
  resolveAuthStatus,
  resolveCredentialMaterial,
  resolveKeychainCapability,
  snapshotAuthBindingStore,
  type AuthBindingStore,
  type AuthBindingStoreSnapshot,
  type CreateKeychainSecretStoreOptions,
  type KeychainCapability,
  type SecretStore,
} from './secret-store.js'

export {
  AUTH_BINDINGS_FILENAME,
  createPersistedAuthBindingStore,
  defaultRuntimeConfigDir,
  flushAuthBindingStore,
  loadAuthBindingSnapshot,
  parseAuthBindingSnapshot,
  resolveAuthBindingsFilePath,
  saveAuthBindingSnapshot,
  type CreatePersistedAuthBindingStoreOptions,
} from './auth-binding-persist.js'

export type {
  AuthResourceContribution,
  CliArgParam,
  CliCommandContribution,
  CliContribution,
  McpContribution,
  McpServerConfigShape,
  PluginContributes,
  PluginKind,
  PluginManifest,
  SkillsContribution,
} from './manifest.js'

export {
  BUILTIN_PLUGINS,
  BUILTIN_CLI_FEISHU_PLUGIN,
  BUILTIN_MCP_CALENDAR_PLUGIN,
  BUILTIN_MCP_DOCS_PLUGIN,
  BUILTIN_SKILLS_OFFICE_PLUGIN,
  OFFICE_BUILTIN_OUTPUT_DIRS,
  OFFICE_BUILTIN_SKILL_IDS,
} from './builtins.js'

export {
  createPluginRegistry,
  createPluginRegistryFromEnv,
  formatRegistryMcpStatusLine,
  type CreatePluginRegistryOptions,
  type PluginLoadStatus,
  type PluginRegistry,
  type PluginRegistryLoadOptions,
  type PluginRegistryLoadResult,
  type PluginRuntimeRecord,
} from './registry.js'

export {
  discoverLocalPlugins,
  loadPluginJsonFile,
  parsePluginManifestJson,
  resolvePluginSearchPaths,
  type PluginDiscoveryFailure,
  type PluginDiscoveryResult,
} from './discover.js'

export {
  listWorkspaceSkillIds,
  loadSkillsContributions,
  normalizeVirtualSkillRoot,
  resolvePluginPackageRoot,
  resolveSkillsBundledDir,
  seedSkillsContribution,
  type SkillsAggregate,
  type SkillsSeedResult,
} from './skills-loader.js'

export {
  applyMcpNeedsApproval,
  buildMcpChildEnv,
  forceToolNeedsApproval,
  mergeReadOnlyAllowlist,
  resolveMcpBearerToken,
  resolveMcpChildEnvKeys,
  resolveMcpContribution,
  type McpHost,
  type McpLoadAggregate,
  type McpResolveAuthOptions,
  type McpServerLoadStatus,
  type ResolvedMcpServer,
} from './mcp-loader.js'

export {
  assertSafeArgvTemplate,
  buildCliArgv,
  buildCliChildEnv,
  cliToolName,
  formatRegistryCliStatusLine,
  loadCliContributions,
  resolveCliExecutable,
  type CliLoadAggregate,
  type CliLoadStatus,
  type CliRunner,
} from './cli-loader.js'

export {
  authResourceToBinding,
  formatAuthDoctorLine,
  formatAuthStatusSummary,
  pickAuthResourceForCli,
  pickAuthResourceForMcp,
  resolveAuthResourceMaterial,
  resolveAuthResourceStatus,
  resolveEffectiveBinding,
  resolvePluginAuthStatuses,
  sanitizeHint,
  type PluginAuthStatus,
  type ResolvePluginAuthOptions,
} from './auth-status.js'

export {
  buildDoctorReport,
  buildListReport,
  collectDoctorFindings,
  formatDoctorText,
  formatListText,
  runPluginDoctor,
  runPluginList,
  type DoctorFinding,
  type PluginDoctorReport,
  type PluginListReport,
  type PluginListRow,
  type RunOperatorOptions,
} from './operator.js'

export {
  runAuthLogin,
  runAuthLogout,
  runAuthStatus,
  type AuthMutateReport,
  type AuthStatusReport,
  type AuthStatusRow,
  type RunAuthOptions,
} from './operator-auth.js'

