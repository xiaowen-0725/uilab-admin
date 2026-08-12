/**
 * PluginManifest schema v1 (Spec #17 / ticket #19).
 * Declarative only — no I/O.
 */

import type {
  CliSessionStatusPredicate,
  CredentialKind,
  SecretRef,
} from './types.js'

export type PluginKind = 'builtin' | 'local'

export type McpServerConfigShape =
  | {
      type: 'http'
      url: string
      requestInit?: RequestInit
      timeout?: number
    }
  | {
      type: 'stdio'
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    }

/** MCP contribution declared by a plugin (env-resolved at load time). */
export type McpContribution = {
  /** Server key, e.g. docs / calendar / feishu_docs */
  serverId: string
  /** Optional provider-owned default HTTP endpoint; env aliases override it. */
  url?: string
  /** First non-empty env wins */
  urlFromEnv?: string[]
  commandFromEnv?: string[]
  argsFromEnv?: string[]
  bearerTokenFromEnv?: string[]
  /** Extra keys for stdio child (plus optional MCP_CHILD_ENV_KEYS host-wide) */
  childEnvKeys?: string[]
  timeoutMs?: number
  /** Exact tool names free of approval for this server */
  readOnlyToolNames?: string[]
  /** Stable model-visible prefix while preserving Provider originalName. */
  toolNamePrefix?: string
}

/**
 * Skills contribution: virtual root + optional missing-only seed from bundled templates.
 * Does not overwrite existing workspace SKILL.md.
 */
export type SkillsContribution = {
  /** VoltAgent Workspace virtual skills root (default `/skills`) */
  virtualRoot?: string
  /** On-disk directory under workspace root (default `skills`) */
  workspaceDir?: string
  /** Skill folder ids to seed (directory names under bundledDir) */
  skillIds?: string[]
  /**
   * Templates directory relative to package root (e.g. `bundled-skills`),
   * or absolute path when resolved by caller.
   */
  bundledRelativeDir?: string
  /** Conventional deliverable dirs relative to workspace root */
  outputDirs?: string[]
  /** Only `missing-only` is supported (default). */
  seedStrategy?: 'missing-only'
  /**
   * Trusted builtin only: synchronize installed Agent Skill packages into a
   * runtime-managed workspace root. Filesystem plugin.json cannot declare it.
   */
  installedSource?: {
    /** First non-empty environment variable wins. */
    rootFromEnv?: string[]
    /** Default directory relative to the current user's home. */
    defaultUserRelativeDir?: string
    /** Include skill folder names beginning with one of these prefixes. */
    includePrefixes: string[]
    syncStrategy: 'replace-generated'
  }
}

/** Provider-owned product metadata projected into the Capability Surface. */
export type ConnectorCapabilityContribution = {
  id: string
  name: string
  description?: string
  channel: 'domain_cli' | 'mcp' | 'none'
  /** Provider-declared public scopes for the current migration slice. */
  toolNames: string[]
  available: boolean
}

/**
 * One product Connector contributed by one Plugin package.
 * Host projection supplies pluginRefs/auth pluginId from the owning manifest.
 * Multi-provider aggregation for one connector id is intentionally deferred.
 */
export type ConnectorContribution = {
  id: string
  name: string
  description: string
  authResourceId: string
  authKind: CredentialKind
  primaryChannel: 'domain_cli' | 'mcp' | 'hybrid' | 'none'
  capabilities: ConnectorCapabilityContribution[]
  /**
   * Executable basenames owned by this Connector and gated by Task selection
   * plus Provider auth before the generic Workspace Shell may run them.
   */
  commandScopes?: string[]
  toolScope: string[]
  availability: 'sidecar' | 'fake-catalog-only' | 'missing-binary'
  channelAuth?: Array<{
    channel: 'domain_cli' | 'mcp'
    authKind: CredentialKind
    resourceId?: string
    label: string
  }>
  packageHint?: string
  loginHint?: string
  /**
   * Brand icon key (pure string). The Renderer maps this to an actual icon
   * asset; the sidecar never resolves it to a file path. (#49)
   */
  brandIconKey?: string
}

/**
 * Domain CLI (lark-cli / allowlisted binary style) — not a free terminal.
 * Host invokes via execFile(command, argv[]); no shell string join.
 */
export type CliArgParam = {
  name: string
  type?: 'string' | 'number' | 'boolean' | 'string_array'
  description?: string
  /** Default true when omitted */
  required?: boolean
}

export type CliCommandContribution = {
  /** Tool suffix → tool name `cli.<cliId>.<name>` */
  name: string
  /** Argv template; placeholders `{{param}}` filled from structured args only */
  argv: string[]
  /**
   * Trusted builtin Provider only: take the exact string[] from this parameter
   * as argv for the fixed CLI binary. Always forces Host approval.
   */
  passthroughArgvParam?: string
  parameters?: CliArgParam[]
  description?: string
  /** Default true (fail-closed). Explicit false only when readOnly. */
  needsApproval?: boolean
  /** When true (and needsApproval not forced true), approval may be skipped */
  readOnly?: boolean
  timeoutMs?: number
}

export type CliContribution = {
  cliId: string
  /** Default binary name / path when env override empty */
  command?: string
  commandFromEnv?: string[]
  packageHint?: string
  childEnvKeys?: string[]
  /** Default workspace root when load provides workspaceRoot */
  defaultCwd?: 'workspace' | 'plugin' | string
  commands: CliCommandContribution[]
}

export type OAuthContribution =
  | {
      /** Platform-owned OAuth App; end users never configure Provider credentials. */
      strategy: 'managed_broker'
      /** MCP contribution that consumes the resulting bearer token. */
      mcpServerId: string
      /** Stable Provider key understood by the platform Connector Broker. */
      providerId: string
      /** Platform deployment configuration, not an end-user setting. */
      brokerBaseUrl?: string
      brokerBaseUrlFromEnv?: string[]
      scopes?: string[]
    }
  | {
      /** Generic self-hosted plugin path; not used by builtin GitHub. */
      strategy: 'host_credentials'
      mcpServerId: string
      clientIdFromEnv: string[]
      clientSecretFromEnv: string[]
      redirectUriFromEnv?: string[]
      scopes?: string[]
    }

/**
 * Trusted Provider-owned CLI session authorization contract.
 * Host executes the declared argv with execFile/spawn; it does not understand
 * Provider command names, output copy, or browser URLs.
 */
export type CliSessionContribution = {
  strategy: 'device_flow'
  command?: string
  commandFromEnv?: string[]
  /** Closed child environment allowlist; base runtime keys are added by Host. */
  childEnvKeys?: string[]
  /**
   * Env keys that Host sets to an app-scoped state dir for CLI session
   * isolation (#44). The Host injects <runtimeConfigDir>/cli-sessions/<pluginId>
   * for each key, unless the operator already set it (operator override wins).
   */
  sessionStateEnv?: string[]
  minimumVersion?: string
  versionArgv?: string[]
  bootstrap?: {
    /** Structured CLI error subtypes that require first-run configuration. */
    whenErrorSubtypes: string[]
    /** Long-running command that emits a public verification URL then polls. */
    argv: string[]
    verificationUrlHosts: string[]
    timeoutMs?: number
  }
  authorization: {
    /** Short command returning JSON with verification_url + device_code. */
    startArgv: string[]
    /** Long-running completion command; supports {{deviceCode}}. */
    completeArgv: string[]
    verificationUrlHosts: string[]
    defaultDomains?: string[]
    domainFlag?: string
    timeoutMs?: number
  }
  /**
   * Clears the Provider CLI session so UI revoke cannot leave a reconnectable
   * login behind. Defaults to `auth logout --json` when omitted.
   */
  logoutArgv?: string[]
}

/**
 * Auth resource declaration (enable ≠ login).
 * Config stores refs / hints only — never secret values.
 */
export type AuthResourceContribution = {
  /** e.g. mcp:docs, cli:feishu, bearer */
  resourceId: string
  kind: CredentialKind
  /** All listed env names must be non-empty for env_ref / app_client */
  envNames?: string[]
  /** Single SecretRef (env name or memory key); no secret value in manifest */
  secretRef?: SecretRef
  loginHint?: string
  /** OAuth strategy metadata; never contains Provider secret values. */
  oauth?: OAuthContribution
  /** Trusted Provider-owned CLI Device Flow; no Provider ids in Host core. */
  cliSession?: CliSessionContribution
  /**
   * cli_session: optional probe. exitCode === expectExitCode → connected.
   * commandFromEnv overrides bare command when set.
   */
  statusCommand?: {
    command?: string
    commandFromEnv?: string[]
    argv?: string[]
    expectExitCode?: number
    /** Optional Provider-owned structured success condition. */
    connectedWhen?: CliSessionStatusPredicate
  }
}

export type PluginContributes = {
  mcp?: McpContribution[]
  skills?: SkillsContribution
  cli?: CliContribution[]
  auth?: AuthResourceContribution[]
  /** Product metadata owned by this Plugin; projected generically by Host. */
  connectors?: ConnectorContribution[]
  /** Later tickets: tools */
}

export type PluginManifest = {
  schemaVersion: 1
  id: string
  name: string
  version: string
  kind: PluginKind
  /** When true and not disabled via PLUGINS_DISABLED, include in load set */
  enabledByDefault?: boolean
  contributes?: PluginContributes
}
