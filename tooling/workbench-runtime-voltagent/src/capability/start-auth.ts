/**
 * Provider-neutral startAuth dispatcher for the Capability Surface.
 *
 * Provider behavior belongs to PluginManifest auth contributions and their
 * Sidecar runtimes. This module only dispatches by auth kind and projects a
 * credential-safe result for the Renderer.
 */

import type { ConnectorDescriptor } from '../plugin/connector-descriptor.js'
import type { StartAuthRequest, StartAuthResult } from './types.js'

export type StartAuthOptions = {
  descriptors?: readonly ConnectorDescriptor[]
  /** Platform-managed OAuth runtime; Provider credentials stay in the Broker. */
  beginOAuth?: (input: {
    connectorId: string
    descriptor: ConnectorDescriptor
  }) => Promise<{ authorizationUrl: string; expiresIn?: number }>
  /** Provider-declared CLI auth runtime; device codes stay in the Sidecar. */
  beginCliSession?: (input: {
    connectorId: string
    descriptor: ConnectorDescriptor
    domains?: string[]
  }) => Promise<{
    phase: 'authorization_required' | 'already_connected'
    step: 'configure' | 'authorize' | 'connected'
    authorizationUrl?: string
    expiresIn?: number
    message: string
  }>
}

export async function startConnectorAuth(
  request: StartAuthRequest,
  options: StartAuthOptions = {},
): Promise<StartAuthResult> {
  const connectorId = request.connectorId.trim()
  const descriptor = (options.descriptors ?? []).find(
    (candidate) => candidate.id === connectorId,
  )

  if (!descriptor) {
    return {
      ok: false,
      connectorId,
      error: 'unknown_connector',
      message: `未知连接器：${connectorId}`,
    }
  }

  const authKind = descriptor.authSummarySource.kind
  if (authKind === 'oauth2') {
    if (!options.beginOAuth) {
      return unavailable(
        connectorId,
        descriptor,
        'oauth_unavailable',
        `「${descriptor.name}」需要平台连接服务，但当前 Runtime 未启用该服务。`,
      )
    }
    try {
      const started = await options.beginOAuth({ connectorId, descriptor })
      return {
        ok: true,
        connectorId,
        kind: 'oauth2',
        phase: 'login_started',
        step: 'authorize',
        verificationUrl: started.authorizationUrl,
        expiresIn: started.expiresIn,
        loginHint:
          descriptor.loginHint ??
          `通过浏览器完成「${descriptor.name}」账号授权。`,
        message: `已启动「${descriptor.name}」一键授权，请在浏览器中确认。`,
      }
    } catch (error) {
      return unavailable(
        connectorId,
        descriptor,
        'oauth_start_failed',
        `启动「${descriptor.name}」授权失败：${safeErrorMessage(error)}`,
      )
    }
  }

  if (authKind === 'cli_session') {
    if (!options.beginCliSession) {
      return unavailable(
        connectorId,
        descriptor,
        'cli_unavailable',
        `「${descriptor.name}」需要 CLI 授权运行时，但当前 Runtime 未启用该能力。`,
      )
    }
    try {
      const started = await options.beginCliSession({
        connectorId,
        descriptor,
        domains: request.domains,
      })
      return {
        ok: true,
        connectorId,
        kind: 'cli_session',
        phase:
          started.phase === 'already_connected'
            ? 'already_connected'
            : 'login_started',
        step: started.step,
        verificationUrl: started.authorizationUrl,
        expiresIn: started.expiresIn,
        loginHint:
          descriptor.loginHint ??
          `通过浏览器完成「${descriptor.name}」CLI session 授权。`,
        message: started.message,
      }
    } catch (error) {
      return unavailable(
        connectorId,
        descriptor,
        'cli_start_failed',
        `启动「${descriptor.name}」CLI 授权失败：${safeErrorMessage(error)}`,
      )
    }
  }

  if (authKind === 'static_bearer') {
    const loginHint =
      descriptor.loginHint ??
      `请为「${descriptor.name}」配置访问令牌后刷新连接状态。`
    return {
      ok: true,
      connectorId,
      kind: 'static_bearer',
      phase: 'hint_only',
      loginHint,
      message: loginHint,
    }
  }

  return unavailable(
    connectorId,
    descriptor,
    'unsupported_auth_kind',
    `当前 Runtime 尚不能启动「${descriptor.name}」的 ${authKind} 授权。`,
  )
}

function unavailable(
  connectorId: string,
  descriptor: ConnectorDescriptor,
  error: string,
  message: string,
): Extract<StartAuthResult, { ok: false }> {
  return {
    ok: false,
    connectorId,
    error,
    loginHint: descriptor.loginHint,
    message,
  }
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240)
}
