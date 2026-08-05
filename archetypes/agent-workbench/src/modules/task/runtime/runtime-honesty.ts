/**
 * User-facing honesty copy for Runtime paths.
 * Fake vs local VoltAgent must not be confused — both are non-production,
 * but VoltAgent can produce real local side effects (files) after approval.
 */

export type RuntimeHonestyMode = 'fake' | 'voltagent'

export interface RuntimeHonestyCopy {
  /** Short banner on Timeline (11px quiet line). */
  banner: string
  /** aria-label for the timeline region. */
  timelineAriaLabel: string
  /** Context panel env chips. */
  contextItems: string[]
  submitAccepted: string
  cancelAccepted: string
  cancelRequested: string
  clarifyingSubmit: (preview: string) => string
  submitWithPreview: (preview: string) => string
  waitingApproval: string
  recovery: string
}

const FAKE: RuntimeHonestyCopy = {
  banner: 'Deterministic Fake Runtime · 非生产 · 本地事件投影',
  timelineAriaLabel: '任务时间线（Deterministic Fake Runtime）',
  contextItems: ['Deterministic Fake Runtime', '非生产', '无远程 Agent Runtime'],
  submitAccepted:
    '已提交到 Deterministic Fake Runtime（非生产，不会调用远程 Agent Runtime）',
  cancelAccepted: '已请求取消（Deterministic Fake Runtime，非生产）',
  cancelRequested: '已请求取消（Deterministic Fake Runtime，非生产）',
  clarifyingSubmit: (preview) =>
    `已提交澄清输入（Deterministic Fake Runtime，非生产）：${preview}`,
  submitWithPreview: (preview) =>
    `已提交到 Deterministic Fake Runtime（非生产，不会调用远程 Agent Runtime）：${preview}`,
  waitingApproval:
    '当前 Run 等待审批。请在时间线中选择「允许一次」或「拒绝」（Fake，无真实副作用）。',
  recovery: '检测到事件序号缺口，可尝试对账恢复（Fake reconcile）。',
}

const VOLTAGENT: RuntimeHonestyCopy = {
  banner: '本机 VoltAgent Runtime · 非远程生产集群 · 本地侧车',
  timelineAriaLabel: '任务时间线（本机 VoltAgent Runtime）',
  contextItems: ['本机 VoltAgent Runtime', '非远程生产集群', '本地侧车'],
  submitAccepted: '已提交到本机 VoltAgent Runtime（非远程生产集群）',
  cancelAccepted: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
  cancelRequested: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
  clarifyingSubmit: (preview) =>
    `已提交澄清输入（本机 VoltAgent Runtime）：${preview}`,
  submitWithPreview: (preview) =>
    `已提交到本机 VoltAgent Runtime（非远程生产集群）：${preview}`,
  waitingApproval:
    '当前 Run 等待审批。请在时间线中选择「允许一次」或「拒绝」（本机侧车；批准后可能写入工作区文件）。',
  recovery: '检测到事件序号缺口，可尝试对账恢复（本机 Runtime）。',
}

export function runtimeHonestyCopy(
  mode: RuntimeHonestyMode = 'fake',
): RuntimeHonestyCopy {
  return mode === 'voltagent' ? VOLTAGENT : FAKE
}

export function previewText(text: string, max = 40): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
