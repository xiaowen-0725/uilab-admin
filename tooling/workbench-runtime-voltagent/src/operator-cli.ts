/**
 * Operator CLI — plugin list / doctor / auth (#24, #32).
 *
 * Usage:
 *   pnpm plugin:list
 *   pnpm plugin:doctor
 *   pnpm plugin:auth status [pluginId]
 *   pnpm plugin:auth login <pluginId> --from-env MCP_DOCS_BEARER_TOKEN
 *   pnpm plugin:auth logout <pluginId>
 *
 * Not an Agent tool surface. Never prints secret values.
 * Never pass raw tokens on the command line — use --from-env only.
 */

import { runPluginDoctor, runPluginList } from './plugin/operator.js'
import {
  runAuthLogin,
  runAuthLogout,
  runAuthStatus,
} from './plugin/operator-auth.js'

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name)
  if (idx < 0) return undefined
  return argv[idx + 1]
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name)
}

type Cmd =
  | { kind: 'list'; json: boolean }
  | { kind: 'doctor'; json: boolean }
  | { kind: 'auth-status'; json: boolean; pluginId?: string }
  | {
      kind: 'auth-login'
      json: boolean
      pluginId: string
      resourceId?: string
      fromEnv?: string
      toKeychain?: boolean
      oauthBegin?: boolean
      oauthComplete?: boolean
      authorizationEndpoint?: string
      tokenEndpoint?: string
      clientId?: string
      redirectUri?: string
      scopes?: string[]
      code?: string
      state?: string
    }
  | {
      kind: 'auth-logout'
      json: boolean
      pluginId: string
      resourceId?: string
    }
  | { kind: 'help' }

function parseArgs(argv: string[]): Cmd {
  const json = hasFlag(argv, '--json')
  const head = argv.filter((a) => !a.startsWith('--'))

  if (head[0] === 'auth') {
    const sub = head[1] ?? 'status'
    if (sub === 'status') {
      return { kind: 'auth-status', json, pluginId: head[2] }
    }
    if (sub === 'login') {
      const pluginId = head[2] ?? ''
      const fromEnv = parseFlag(argv, '--from-env')
      const resourceId = parseFlag(argv, '--resource')
      const toKeychain = hasFlag(argv, '--env-only') ? false : undefined
      const scopeRaw = parseFlag(argv, '--scope')
      return {
        kind: 'auth-login',
        json,
        pluginId,
        fromEnv,
        resourceId,
        toKeychain,
        oauthBegin: hasFlag(argv, '--oauth-begin'),
        oauthComplete: hasFlag(argv, '--oauth-complete'),
        authorizationEndpoint: parseFlag(argv, '--auth-url'),
        tokenEndpoint: parseFlag(argv, '--token-url'),
        clientId: parseFlag(argv, '--client-id'),
        redirectUri: parseFlag(argv, '--redirect-uri'),
        scopes: scopeRaw ? scopeRaw.split(/\s+/).filter(Boolean) : undefined,
        code: parseFlag(argv, '--code'),
        state: parseFlag(argv, '--state'),
      }
    }
    if (sub === 'logout') {
      return {
        kind: 'auth-logout',
        json,
        pluginId: head[2] ?? '',
        resourceId: parseFlag(argv, '--resource'),
      }
    }
    return { kind: 'help' }
  }

  if (head[0] === 'doctor') return { kind: 'doctor', json }
  if (head[0] === 'list' || head[0] === undefined) {
    return { kind: 'list', json }
  }
  if (head[0] === 'help' || hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    return { kind: 'help' }
  }
  return { kind: 'help' }
}

function printHelp() {
  process.stdout.write(`侧车插件运维 CLI（非 Agent 工具）

用法:
  plugin:list [--json]
  plugin:doctor [--json]
  plugin:auth status [pluginId] [--json]
  plugin:auth login <pluginId> --from-env <ENV_NAME> [--resource <id>] [--env-only] [--json]
  plugin:auth login <pluginId> --oauth-begin --auth-url <URL> --token-url <URL> --client-id <ID> [--redirect-uri <URI>] [--scope "a b"]
  plugin:auth login <pluginId> --oauth-complete --code <CODE> --state <STATE>
  plugin:auth logout <pluginId> [--resource <id>] [--json]

说明:
  - PAT login 只从 --from-env 读 secret，禁止在 argv 贴 token
  - OAuth PKCE：--oauth-begin 打印 URL；回调后 --oauth-complete --code --state
  - 默认写入 OS Keychain 并持久化 AuthBinding；--env-only 仅绑 env_ref
  - logout 撤销绑定（#28），残留 process env 不再注入
  - 输出永不包含 secret 值
`)
}

async function main() {
  const cmd = parseArgs(process.argv.slice(2))
  const env = process.env

  if (cmd.kind === 'help') {
    printHelp()
    process.exit(0)
  }

  if (cmd.kind === 'list') {
    const report = await runPluginList({ env })
    try {
      process.stdout.write(
        cmd.json
          ? `${JSON.stringify(report.json, null, 2)}\n`
          : report.text,
      )
    } finally {
      await report.disconnect()
    }
    process.exit(0)
  }

  if (cmd.kind === 'doctor') {
    const report = await runPluginDoctor({ env })
    try {
      if (cmd.json) {
        process.stdout.write(`${JSON.stringify(report.json, null, 2)}\n`)
      } else {
        process.stdout.write(report.text)
        process.stdout.write(
          report.ok
            ? '\n医生检查：通过（无 warn/error）\n'
            : '\n医生检查：存在 warn/error，见上表\n',
        )
      }
    } finally {
      await report.disconnect()
    }
    process.exit(report.ok ? 0 : 1)
  }

  if (cmd.kind === 'auth-status') {
    const report = await runAuthStatus({ env, pluginId: cmd.pluginId })
    try {
      process.stdout.write(
        cmd.json
          ? `${JSON.stringify(report.json, null, 2)}\n`
          : report.text,
      )
    } finally {
      await report.disconnect()
    }
    process.exit(report.ok ? 0 : 1)
  }

  if (cmd.kind === 'auth-login') {
    const report = await runAuthLogin({
      env,
      pluginId: cmd.pluginId,
      resourceId: cmd.resourceId,
      fromEnv: cmd.fromEnv,
      toKeychain: cmd.toKeychain,
      oauthBegin: cmd.oauthBegin,
      oauthComplete: cmd.oauthComplete,
      authorizationEndpoint: cmd.authorizationEndpoint,
      tokenEndpoint: cmd.tokenEndpoint,
      clientId: cmd.clientId,
      redirectUri: cmd.redirectUri,
      scopes: cmd.scopes,
      code: cmd.code,
      state: cmd.state,
    })
    try {
      process.stdout.write(
        cmd.json
          ? `${JSON.stringify(report.json, null, 2)}\n`
          : report.text,
      )
    } finally {
      await report.disconnect()
    }
    process.exit(report.ok ? 0 : 1)
  }

  if (cmd.kind === 'auth-logout') {
    const report = await runAuthLogout({
      env,
      pluginId: cmd.pluginId,
      resourceId: cmd.resourceId,
    })
    try {
      process.stdout.write(
        cmd.json
          ? `${JSON.stringify(report.json, null, 2)}\n`
          : report.text,
      )
    } finally {
      await report.disconnect()
    }
    process.exit(report.ok ? 0 : 1)
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`operator-cli 失败：${msg}\n`)
  process.exit(2)
})
