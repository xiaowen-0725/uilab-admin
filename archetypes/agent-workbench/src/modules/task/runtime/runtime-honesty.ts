/**
 * User-facing honesty copy for the Runtime path.
 *
 * VoltAgent is the only runtime mode (ADR-0018 removed the Deterministic Fake
 * Runtime). The copy stays honest: the local sidecar is non-remote-production,
 * and approvals may write workspace files.
 */

export interface RuntimeHonestyCopy {
  /** Short banner on Timeline / empty hub (quiet secondary line). */
  readonly banner: string
  /** aria-label for the timeline region. */
  readonly timelineAriaLabel: string
  readonly emptyTimeline: string
  readonly submitAccepted: string
  readonly cancelAccepted: string
  readonly clarifyingSubmit: (preview: string) => string
  readonly submitWithPreview: (preview: string) => string
  readonly waitingApproval: string
  readonly waitingInput: string
  readonly approvalApproved: string
  readonly approvalRejected: string
  readonly inputProvided: string
  readonly recovery: string
  /** Secondary command success notices. */
  readonly retryAccepted: string
  readonly queueAccepted: string
  readonly steerAccepted: string
  readonly reconcileAccepted: string
}

export const VOLTAGENT_RUNTIME_HONESTY_COPY = {
  banner: '本机 VoltAgent Runtime · 非远程生产集群 · 本地侧车',
  timelineAriaLabel: '任务时间线（本机 VoltAgent Runtime）',
  emptyTimeline: '还没有执行记录。发送后会出现在这里。',
  submitAccepted: '已提交到本机 VoltAgent Runtime（非远程生产集群）',
  cancelAccepted: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
  clarifyingSubmit: (preview) =>
    `已提交澄清输入（本机 VoltAgent Runtime）：${preview}`,
  submitWithPreview: (preview) =>
    `已提交到本机 VoltAgent Runtime（非远程生产集群）：${preview}`,
  waitingApproval:
    '当前 Run 等待审批。请在底部授权卡片选择「允许一次」或「拒绝」（本机侧车；批准后可能写入工作区文件）。',
  waitingInput: '当前 Run 等待你的回答。可在时间线卡片上选择，或在下方直接回复。',
  approvalApproved: '已允许一次（本机侧车；批准后可能写入工作区文件）',
  approvalRejected: '已拒绝（本机侧车，未执行写操作）',
  inputProvided: '已提供补充输入（本机 VoltAgent Runtime）',
  recovery: '检测到事件序号缺口，可尝试对账恢复（本机 Runtime）。',
  retryAccepted: '已重试本轮（本机运行时）',
  queueAccepted: '已排队后续消息（本机 VoltAgent Runtime）',
  steerAccepted: '已发送转向（本机 VoltAgent Runtime）',
  reconcileAccepted: '已对账中断 Run（本机 Runtime）',
} as const satisfies RuntimeHonestyCopy

export function previewText(text: string, max = 40): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export type RuntimeFailureCopy = {
  title: string
  body: string
  /** Original engine string when it differs from the shown copy. */
  raw?: string
}

const SIDECAR_DISCONNECT_TITLE = '无法连接本机运行时'
const SIDECAR_DISCONNECT_BODY =
  '确认已同时打开本机侧车（localhost:3141）后再试。'
const GENERIC_FAILURE_TITLE = '这一轮没完成'
const GENERIC_FAILURE_BODY = '本机运行时中断了。可以重试这一轮。'

const SIDECAR_DISCONNECT_NEEDLES = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'econnrefused',
  'econnreset',
  'etimedout',
  'err_connection',
  'sidecar unavailable',
  'sidecar disconnected',
  'bad gateway',
  'gateway timeout',
  '连接 voltagent 侧车失败',
] as const

function isSidecarDisconnectMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    SIDECAR_DISCONNECT_NEEDLES.some((needle) => normalized.includes(needle)) ||
    /侧车\s*http\s*(502|503|504)\b/i.test(message)
  )
}

function isEngineHttpDump(message: string): boolean {
  return /侧车\s*http\s*\d{3}\b/i.test(message)
}

function genericFailure(raw?: string): RuntimeFailureCopy {
  return raw
    ? { title: GENERIC_FAILURE_TITLE, body: GENERIC_FAILURE_BODY, raw }
    : { title: GENERIC_FAILURE_TITLE, body: GENERIC_FAILURE_BODY }
}

/** Map engine/network failures to actionable Chinese. Do not invent a cause. */
export function humanizeRuntimeFailure(
  raw: string | undefined,
): RuntimeFailureCopy {
  const message = raw?.trim() ?? ''
  if (isSidecarDisconnectMessage(message)) {
    return {
      title: SIDECAR_DISCONNECT_TITLE,
      body: SIDECAR_DISCONNECT_BODY,
      raw: message,
    }
  }
  if (!message || message === '运行失败') {
    return genericFailure()
  }
  if (isEngineHttpDump(message)) {
    return genericFailure(message)
  }
  if (/[\u4e00-\u9fff]/.test(message)) {
    return { title: GENERIC_FAILURE_TITLE, body: message }
  }
  return genericFailure(message)
}
