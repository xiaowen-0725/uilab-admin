import type { StartAuthResult } from '../ports/capability-snapshot-port'

export function formatStartAuthNotice(result: StartAuthResult): string {
  if (result.ok && result.phase === 'login_started' && result.verificationUrl) {
    const next =
      result.step === 'configure'
        ? '完成应用配置后将自动继续账号授权。'
        : '完成后连接状态会自动刷新。'
    return `${result.message}${next}`
  }
  return result.message
}

export function formatTaskConnectorSelectionNotice(
  connectorName: string,
  selected: boolean
): string {
  return selected
    ? `已为当前任务启用「${connectorName}」，将从下一 Turn 生效。`
    : `已停止为当前任务启用「${connectorName}」；账号仍保持连接。`
}
