/**
 * Sidecar plugin public surface — Registry, SecurityPolicy, SecretRef, loaders.
 * Office assembly uses this package only (no office-mcp / office-skills façades).
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
  formatRegistryMcpStatusLine,
  type CreatePluginRegistryOptions,
  type PluginLoadStatus,
  type PluginRegistry,
  type PluginRegistryLoadOptions,
  type PluginRegistryLoadResult,
  type PluginRuntimeRecord,
} from './registry.js'

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
  resolveMcpChildEnvKeys,
  resolveMcpContribution,
  type McpHost,
  type McpLoadAggregate,
  type McpServerLoadStatus,
  type ResolvedMcpServer,
} from './mcp-loader.js'

export {
  assertSafeArgvTemplate,
  buildCliArgv,
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
  resolveAuthResourceStatus,
  resolvePluginAuthStatuses,
  sanitizeHint,
  type PluginAuthStatus,
  type ResolvePluginAuthOptions,
} from './auth-status.js'

