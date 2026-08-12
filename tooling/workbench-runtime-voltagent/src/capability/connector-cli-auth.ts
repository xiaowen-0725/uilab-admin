/**
 * Provider-declared CLI Device Flow runtime.
 *
 * This module is intentionally Provider-neutral. Product command names,
 * first-run rules, argv, version floor and verification hosts come from the
 * owning PluginManifest. Device codes stay inside this Sidecar runtime.
 */

import type { CliRunner } from '../plugin/cli-loader.js'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import type {
  AuthResourceContribution,
  CliSessionContribution,
  PluginManifest,
} from '../plugin/manifest.js'
import { firstEnv } from '../plugin/parse-util.js'
import type { ProfileEnv } from '../plugin/types.js'
import { filterChildEnv } from '../plugin/security-policy.js'
import { isCliSessionConnected } from '../plugin/cli-session-status.js'
import { defaultRuntimeConfigDir } from '../plugin/auth-binding-persist.js'

export type CliAuthProcessResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type CliAuthProcessHandle = {
  completion: Promise<CliAuthProcessResult>
  stop(): void
}

export type CliAuthProcessRunner = (
  command: string,
  argv: string[],
  options: {
    env: Record<string, string>
    timeoutMs: number
    onOutput(chunk: string): void
  },
) => CliAuthProcessHandle

export type ConnectorCliAuthStart = {
  connectorId: string
  kind: 'cli_session'
  phase: 'authorization_required' | 'already_connected'
  step: 'configure' | 'authorize' | 'connected'
  authorizationUrl?: string
  expiresIn?: number
  message: string
}

export type ConnectorCliAuthTransition = {
  connectorId: string
  kind: 'cli_session'
  phase: 'authorization_required' | 'connected' | 'failed'
  step: 'configure' | 'authorize' | 'connected'
  authorizationUrl?: string
  message: string
}

export type ConnectorCliAuthRuntime = {
  begin(connectorId: string, domains?: string[]): Promise<ConnectorCliAuthStart>
  reconcile(connectorId?: string): Promise<ConnectorCliAuthTransition[]>
  dispose(): Promise<void>
}

type ResolvedCliFlow = {
  descriptor: ConnectorDescriptor
  manifest: PluginManifest
  resource: AuthResourceContribution
  contribution: CliSessionContribution
  command: string
}

type CliAuthSession =
  | {
      connectorId: string
      stage: 'bootstrap'
      flow: ResolvedCliFlow
      domains: string[]
      handle: CliAuthProcessHandle
      result?: CliAuthProcessResult
    }
  | {
      connectorId: string
      stage: 'authorization_issued'
      flow: ResolvedCliFlow
      deviceCode: string
      expiresAt: number
      handle?: CliAuthProcessHandle
      result?: CliAuthProcessResult
    }

const DEFAULT_URL_TIMEOUT_MS = 30_000
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024

export function createDefaultCliAuthProcessRunner(): CliAuthProcessRunner {
  return (command, argv, options) => {
    const child = spawn(command, argv, {
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let resolveCompletion!: (result: CliAuthProcessResult) => void
    const completion = new Promise<CliAuthProcessResult>((resolve) => {
      resolveCompletion = resolve
    })

    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString('utf8')
      options.onOutput(text)
      if (target === 'stdout') {
        stdout = appendBounded(stdout, text)
      } else {
        stderr = appendBounded(stderr, text)
      }
    }
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))

    const finish = (exitCode: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveCompletion({ stdout, stderr, exitCode })
    }
    child.once('error', (error: NodeJS.ErrnoException) => {
      stderr = appendBounded(stderr, error.code ?? 'spawn_error')
      finish(error.code === 'ENOENT' ? 127 : 1)
    })
    child.once('close', (code, signal) => {
      finish(
        timedOut ? 124 : typeof code === 'number' ? code : signal ? 128 : 1,
      )
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, options.timeoutMs)

    return {
      completion,
      stop() {
        if (settled) return
        child.kill('SIGTERM')
      },
    }
  }
}

function appendBounded(current: string, next: string): string {
  const combined = current + next
  if (Buffer.byteLength(combined) <= MAX_PROCESS_OUTPUT_BYTES) return combined
  return combined.slice(-MAX_PROCESS_OUTPUT_BYTES)
}

export function createConnectorCliAuthRuntime(options: {
  env?: ProfileEnv
  descriptors: readonly ConnectorDescriptor[]
  manifests: readonly PluginManifest[]
  enabledPluginIds: readonly string[]
  runner: CliRunner
  processRunner: CliAuthProcessRunner
}): ConnectorCliAuthRuntime {
  const env = options.env ?? process.env
  const sessions = new Map<string, CliAuthSession>()

  function resolve(connectorId: string): ResolvedCliFlow {
    const descriptor = options.descriptors.find((row) => row.id === connectorId)
    if (!descriptor || descriptor.authSummarySource.kind !== 'cli_session') {
      throw new Error(`连接器 ${connectorId} 未声明 CLI session`)
    }
    const manifest = options.manifests.find(
      (row) => row.id === descriptor.authSummarySource.pluginId,
    )
    const resource = manifest?.contributes?.auth?.find(
      (row) => row.resourceId === descriptor.authSummarySource.resourceId,
    )
    const contribution = resource?.cliSession
    if (!manifest || !resource || !contribution) {
      throw new Error(
        `连接器 ${connectorId} 缺少 Provider CLI auth contribution`,
      )
    }
    if (!options.enabledPluginIds.includes(manifest.id)) {
      throw new Error(`连接器 ${connectorId} 的 Plugin 未启用`)
    }
    const command =
      firstEnv(env, contribution.commandFromEnv) ?? contribution.command?.trim()
    if (!command) {
      throw new Error(`连接器 ${connectorId} 缺少 CLI 可执行文件`)
    }
    return { descriptor, manifest, resource, contribution, command }
  }

  return {
    async begin(connectorId, requestedDomains) {
      const flow = resolve(connectorId)
      await assertMinimumVersion(flow, options.runner, env)
      const statusCommand = flow.resource.statusCommand
      if (!statusCommand) {
        throw new Error(`连接器 ${connectorId} 缺少 CLI statusCommand`)
      }
      const status = await options.runner(
        flow.command,
        statusCommand.argv ?? [],
        { env: flowProcessEnv(flow, env), timeoutMs: 30_000 },
      )
      if (
        isCliSessionConnected(
          status,
          statusCommand.expectExitCode ?? 0,
          statusCommand.connectedWhen,
        )
      ) {
        return {
          connectorId,
          kind: 'cli_session',
          phase: 'already_connected',
          step: 'connected',
          message: `「${flow.descriptor.name}」CLI session 已连接。`,
        }
      }

      const subtype = parseStructuredErrorSubtype(status.stdout, status.stderr)
      const bootstrap = flow.contribution.bootstrap
      if (
        bootstrap &&
        subtype &&
        bootstrap.whenErrorSubtypes.includes(subtype)
      ) {
        sessions.get(connectorId)?.handle?.stop()
        const domains = normalizeDomains(
          requestedDomains,
          flow.contribution.authorization.defaultDomains,
        )
        const authorizationUrl = await startBootstrap(
          connectorId,
          flow,
          domains,
          bootstrap,
          options.processRunner,
          env,
          sessions,
        )
        return {
          connectorId,
          kind: 'cli_session',
          phase: 'authorization_required',
          step: 'configure',
          authorizationUrl,
          message: `请先在浏览器完成「${flow.descriptor.name}」CLI 应用配置。`,
        }
      }

      const issued = await startAuthorization(
        flow,
        normalizeDomains(
          requestedDomains,
          flow.contribution.authorization.defaultDomains,
        ),
        options.runner,
        env,
      )
      sessions.set(connectorId, {
        connectorId,
        stage: 'authorization_issued',
        flow,
        deviceCode: issued.deviceCode,
        expiresAt: Date.now() + issued.expiresIn * 1_000,
      })
      return {
        connectorId,
        kind: 'cli_session',
        phase: 'authorization_required',
        step: 'authorize',
        authorizationUrl: issued.authorizationUrl,
        expiresIn: issued.expiresIn,
        message: `请在浏览器授权「${flow.descriptor.name}」账号。`,
      }
    },

    async reconcile(targetConnectorId) {
      const transitions: ConnectorCliAuthTransition[] = []
      for (const [connectorId, session] of sessions) {
        if (targetConnectorId && connectorId !== targetConnectorId) continue

        if (session.stage === 'bootstrap') {
          if (!session.result) continue
          if (session.result.exitCode !== 0) {
            sessions.delete(connectorId)
            transitions.push({
              connectorId,
              kind: 'cli_session',
              phase: 'failed',
              step: 'configure',
              message: 'CLI 应用配置未完成，请重新连接。',
            })
            continue
          }
          try {
            const issued = await startAuthorization(
              session.flow,
              session.domains,
              options.runner,
              env,
            )
            sessions.set(connectorId, {
              connectorId,
              stage: 'authorization_issued',
              flow: session.flow,
              deviceCode: issued.deviceCode,
              expiresAt: Date.now() + issued.expiresIn * 1_000,
            })
            transitions.push({
              connectorId,
              kind: 'cli_session',
              phase: 'authorization_required',
              step: 'authorize',
              authorizationUrl: issued.authorizationUrl,
              message: `请在浏览器授权「${session.flow.descriptor.name}」账号。`,
            })
          } catch (error) {
            sessions.delete(connectorId)
            transitions.push({
              connectorId,
              kind: 'cli_session',
              phase: 'failed',
              step: 'authorize',
              message: safeErrorMessage(error, '启动 CLI 用户授权失败'),
            })
          }
          continue
        }

        if (Date.now() >= session.expiresAt) {
          session.handle?.stop()
          sessions.delete(connectorId)
          transitions.push({
            connectorId,
            kind: 'cli_session',
            phase: 'failed',
            step: 'authorize',
            message: 'CLI 用户授权已过期，请重新连接。',
          })
          continue
        }

        if (!session.handle) {
          const argv = session.flow.contribution.authorization.completeArgv.map(
            (value) => value.replaceAll('{{deviceCode}}', session.deviceCode),
          )
          const handle = options.processRunner(session.flow.command, argv, {
            env: flowProcessEnv(session.flow, env),
            timeoutMs:
              session.flow.contribution.authorization.timeoutMs ?? 10 * 60_000,
            onOutput() {},
          })
          session.handle = handle
          observeCompletion(session, handle)
          continue
        }
        if (!session.result) continue
        if (session.result.exitCode !== 0) {
          sessions.delete(connectorId)
          transitions.push({
            connectorId,
            kind: 'cli_session',
            phase: 'failed',
            step: 'authorize',
            message: 'CLI 用户授权未完成，请重新连接。',
          })
          continue
        }

        const statusCommand = session.flow.resource.statusCommand
        if (!statusCommand) continue
        const status = await options.runner(
          session.flow.command,
          statusCommand.argv ?? [],
          { env: flowProcessEnv(session.flow, env), timeoutMs: 30_000 },
        )
        if (
          !isCliSessionConnected(
            status,
            statusCommand.expectExitCode ?? 0,
            statusCommand.connectedWhen,
          )
        ) {
          continue
        }
        sessions.delete(connectorId)
        transitions.push({
          connectorId,
          kind: 'cli_session',
          phase: 'connected',
          step: 'connected',
          message: `「${session.flow.descriptor.name}」CLI session 已连接。`,
        })
      }
      return transitions
    },

    async dispose() {
      for (const session of sessions.values()) session.handle?.stop()
      sessions.clear()
    },
  }
}

async function startBootstrap(
  connectorId: string,
  flow: ResolvedCliFlow,
  domains: string[],
  bootstrap: NonNullable<CliSessionContribution['bootstrap']>,
  processRunner: CliAuthProcessRunner,
  env: ProfileEnv,
  sessions: Map<string, CliAuthSession>,
): Promise<string> {
  let resolveUrl!: (url: string) => void
  let rejectUrl!: (error: Error) => void
  const urlPromise = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve
    rejectUrl = reject
  })
  let settled = false
  let outputBuffer = ''
  const handle = processRunner(flow.command, [...bootstrap.argv], {
    env: flowProcessEnv(flow, env),
    timeoutMs: bootstrap.timeoutMs ?? 10 * 60_000,
    onOutput(chunk) {
      if (settled) return
      outputBuffer = `${outputBuffer}${chunk}`.slice(-16_384)
      const url = extractAllowedHttpsUrl(
        outputBuffer,
        bootstrap.verificationUrlHosts,
      )
      if (!url) return
      settled = true
      resolveUrl(url)
    },
  })
  const session: Extract<CliAuthSession, { stage: 'bootstrap' }> = {
    connectorId,
    stage: 'bootstrap',
    flow,
    domains,
    handle,
  }
  sessions.set(connectorId, session)
  void handle.completion.then(
    (result) => {
      session.result = result
      if (settled) return
      settled = true
      rejectUrl(
        new Error(
          result.exitCode === 0
            ? 'CLI 配置流程结束但未返回 verification URL'
            : `CLI 配置流程启动失败（exit ${result.exitCode}）`,
        ),
      )
    },
    (error) => {
      session.result = { stdout: '', stderr: '', exitCode: 1 }
      if (settled) return
      settled = true
      rejectUrl(new Error(safeErrorMessage(error, 'CLI 配置流程启动失败')))
    },
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      urlPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('等待 CLI verification URL 超时')),
          DEFAULT_URL_TIMEOUT_MS,
        )
      }),
    ])
  } catch (error) {
    handle.stop()
    sessions.delete(connectorId)
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function startAuthorization(
  flow: ResolvedCliFlow,
  domains: readonly string[],
  runner: CliRunner,
  env: ProfileEnv,
): Promise<{
  authorizationUrl: string
  deviceCode: string
  expiresIn: number
}> {
  const auth = flow.contribution.authorization
  const argv = [...auth.startArgv]
  if (auth.domainFlag) {
    for (const domain of domains) argv.push(auth.domainFlag, domain)
  }
  const result = await runner(flow.command, argv, {
    env: flowProcessEnv(flow, env),
    timeoutMs: 30_000,
  })
  if (result.exitCode !== 0) {
    throw new Error(`CLI 用户授权启动失败（exit ${result.exitCode}）`)
  }
  const body = parseLastJsonObject(result.stdout)
  const rawUrl =
    typeof body.verification_url === 'string'
      ? body.verification_url
      : typeof body.verification_uri_complete === 'string'
        ? body.verification_uri_complete
        : ''
  const authorizationUrl = validateAllowedHttpsUrl(
    rawUrl,
    auth.verificationUrlHosts,
  )
  const deviceCode =
    typeof body.device_code === 'string' ? body.device_code.trim() : ''
  if (!deviceCode) throw new Error('CLI 用户授权响应缺少 device_code')
  const expiresIn =
    typeof body.expires_in === 'number' && body.expires_in > 0
      ? body.expires_in
      : 600
  return { authorizationUrl, deviceCode, expiresIn }
}

function observeCompletion(
  session: Extract<CliAuthSession, { stage: 'authorization_issued' }>,
  handle: CliAuthProcessHandle,
): void {
  void handle.completion.then(
    (result) => {
      session.result = result
    },
    () => {
      session.result = { stdout: '', stderr: '', exitCode: 1 }
    },
  )
}

function normalizeDomains(
  requested: readonly string[] | undefined,
  defaults: readonly string[] | undefined,
): string[] {
  const source = requested?.length ? requested : (defaults ?? [])
  return [...new Set(source.map((value) => value.trim()).filter(Boolean))]
}

function parseLastJsonObject(stdout: string): Record<string, unknown> {
  const text = stdout.trim()
  const candidates = [
    ...text
      .split('\n')
      .map((line) => line.trim())
      .reverse(),
    text,
  ]
  for (const candidate of candidates) {
    if (!candidate.startsWith('{')) continue
    try {
      const value = JSON.parse(candidate) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('CLI 用户授权响应不是 JSON 对象')
}

function validateAllowedHttpsUrl(
  raw: string,
  allowedHosts: readonly string[],
): string {
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    !allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  ) {
    throw new Error('CLI 返回了未受信任的 verification URL')
  }
  return url.toString()
}

function safeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  return message.slice(0, 240)
}

async function assertMinimumVersion(
  flow: ResolvedCliFlow,
  runner: CliRunner,
  env: ProfileEnv,
): Promise<void> {
  const minimum = flow.contribution.minimumVersion
  if (!minimum) return
  const result = await runner(
    flow.command,
    flow.contribution.versionArgv ?? ['--version'],
    { env: flowProcessEnv(flow, env), timeoutMs: 15_000 },
  )
  const version = `${result.stdout}\n${result.stderr}`.match(
    /\b(\d+\.\d+\.\d+)\b/,
  )?.[1]
  if (
    result.exitCode !== 0 ||
    !version ||
    compareVersions(version, minimum) < 0
  ) {
    throw new Error(`CLI 版本不满足要求：需要 >= ${minimum}`)
  }
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function parseStructuredErrorSubtype(
  stdout: string,
  stderr: string,
): string | undefined {
  for (const raw of [stdout, stderr]) {
    try {
      const value = JSON.parse(raw.trim()) as {
        error?: { subtype?: unknown }
      }
      if (typeof value.error?.subtype === 'string') return value.error.subtype
    } catch {
      // Ignore non-JSON CLI copy.
    }
  }
  return undefined
}

function extractAllowedHttpsUrl(
  chunk: string,
  allowedHosts: readonly string[],
): string | undefined {
  const matches = chunk.match(/https:\/\/[^\s\u001b]+/g) ?? []
  for (const raw of matches) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, ''))
      if (
        url.protocol === 'https:' &&
        allowedHosts.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
      ) {
        return url.toString()
      }
    } catch {
      // Continue looking for a valid URL.
    }
  }
  return undefined
}

function flowProcessEnv(
  flow: ResolvedCliFlow,
  env: ProfileEnv,
): Record<string, string> {
  const base = filterChildEnv(env, flow.contribution.childEnvKeys ?? [], {
    includeBaseKeys: true,
  })
  const stateKeys = flow.contribution.sessionStateEnv ?? []
  if (stateKeys.length === 0) return base
  const sessionDir = path.join(
    defaultRuntimeConfigDir(env),
    'cli-sessions',
    flow.manifest.id,
  )
  try {
    mkdirSync(sessionDir, { recursive: true })
  } catch {
    // Best-effort; the CLI may create it itself.
  }
  for (const key of stateKeys) {
    if (!env[key]) base[key] = sessionDir
  }
  return base
}
