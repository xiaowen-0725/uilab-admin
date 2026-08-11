/**
 * User-facing honesty copy for the Runtime path.
 *
 * VoltAgent is the only runtime mode (ADR-0018 removed the Deterministic Fake
 * Runtime). The copy stays honest: the local sidecar is non-remote-production,
 * and approvals may write workspace files.
 */

export interface RuntimeHonestyCopy {
  /** Short banner on Timeline (11px quiet line). */
  banner: string
  /** aria-label for the timeline region. */
  timelineAriaLabel: string
  /** Context panel env chips. */
  contextItems: string[]
  submitAccepted: string
  cancelAccepted: string
  /** Alias of cancelAccepted (historical dual keys); keep for callers. */
  cancelRequested: string
  clarifyingSubmit: (preview: string) => string
  submitWithPreview: (preview: string) => string
  waitingApproval: string
  approvalApproved: string
  approvalRejected: string
  inputProvided: string
  recovery: string
  /** Secondary command success notices. */
  retryAccepted: string
  queueAccepted: string
  steerAccepted: string
  reconcileAccepted: string
}

const VOLTAGENT: RuntimeHonestyCopy = {
  banner: '本机 VoltAgent Runtime · 非远程生产集群 · 本地侧车',
  timelineAriaLabel: '任务时间线（本机 VoltAgent Runtime）',
  contextItems: [
    '本机 VoltAgent Runtime',
    '非远程生产集群',
    '本地侧车（Office/minimal 由侧车 profile 决定）',
  ],
  submitAccepted: '已提交到本机 VoltAgent Runtime（非远程生产集群）',
  cancelAccepted: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
  clarifyingSubmit: (preview) =>
    `已提交澄清输入（本机 VoltAgent Runtime）：${preview}`,
  submitWithPreview: (preview) =>
    `已提交到本机 VoltAgent Runtime（非远程生产集群）：${preview}`,
  waitingApproval:
    '当前 Run 等待审批。请在底部授权卡片选择「允许一次」或「拒绝」（本机侧车；批准后可能写入工作区文件）。',
  approvalApproved: '已允许一次（本机侧车；批准后可能写入工作区文件）',
  approvalRejected: '已拒绝（本机侧车，未执行写操作）',
  inputProvided: '已提供补充输入（本机 VoltAgent Runtime）',
  recovery: '检测到事件序号缺口，可尝试对账恢复（本机 Runtime）。',
  retryAccepted: '已重试 Turn（本机 VoltAgent Runtime）',
  queueAccepted: '已排队后续消息（本机 VoltAgent Runtime）',
  steerAccepted: '已发送转向（本机 VoltAgent Runtime）',
  reconcileAccepted: '已对账中断 Run（本机 Runtime）',
  cancelRequested: '已请求取消（本机 VoltAgent Runtime，非远程生产集群）',
}

export function runtimeHonestyCopy(): RuntimeHonestyCopy {
  return VOLTAGENT
}

export function previewText(text: string, max = 40): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
