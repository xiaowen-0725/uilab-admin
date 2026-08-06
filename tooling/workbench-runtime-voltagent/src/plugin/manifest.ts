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

export type PluginContributes = {
  mcp?: McpContribution[]
  /** Later tickets: cli, skills, tools, auth */
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
