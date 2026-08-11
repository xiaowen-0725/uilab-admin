import type { StartAuthResult } from '../ports/capability-snapshot-port'

export function formatStartAuthNotice(result: StartAuthResult): string {
  if (!result.ok) {
    return '暂时无法连接账号。请重试，或前往连接器管理查看支持信息。'
  }
  if (result.phase === 'already_connected') return '账号已连接。'
  if (result.phase === 'hint_only') {
    return '暂时无法自动打开账号连接。请前往连接器管理查看连接方式。'
  }
  if (result.step === 'configure') {
    return '已打开账号连接页面。完成设置后，将继续账号授权。'
  }
  return '已打开账号授权页面。完成授权后，连接状态会自动刷新。'
}

export function formatTaskConnectorSelectionNotice(
  connectorName: string,
  selected: boolean
): string {
  return selected
    ? `已为当前任务启用「${connectorName}」，将从下次发送开始生效。`
    : `已停止为当前任务启用「${connectorName}」；账号仍保持连接。`
}
