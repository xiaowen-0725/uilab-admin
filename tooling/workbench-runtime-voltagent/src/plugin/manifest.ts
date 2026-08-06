/**
 * PluginManifest schema v1 (Spec #17 / ticket #19).
 * Declarative only — no I/O.
 */

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
}

export type PluginContributes = {
  mcp?: McpContribution[]
  skills?: SkillsContribution
  /** Later tickets: cli, tools, auth */
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
