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
  /** Alias of cancelAccepted (historical dual keys); keep for callers. */
  cancelRequested: string
  clarifyingSubmit: (preview: string) => string
  submitWithPreview: (preview: string) => string
  waitingApproval: string
  approvalApproved: string
  approvalRejected: string
  inputProvided: string
  recovery: string
  /** Secondary command success notices (mode-aware; not Fake-only). */
  retryAccepted: string
  queueAccepted: string
  steerAccepted: string
  reconcileAccepted: string
}

function buildCopy(
  args: Omit<RuntimeHonestyCopy, 'cancelRequested'>,
): RuntimeHonestyCopy {
  return {
    ...args,
    cancelRequested: args.cancelAccepted,
  }
}

const FAKE: RuntimeHonestyCopy = buildCopy({
  banner: 'Deterministic Fake Runtime · 非生产 · 本地事件投影',
  timelineAriaLabel: '任务时间线（Deterministic Fake Runtime）',
  contextItems: ['Deterministic Fake Runtime', '非生产', '无远程 Agent Runtime'],
  submitAccepted:
    '已提交到 Deterministic Fake Runtime（非生产，不会调用远程 Agent Runtime）',
  cancelAccepted: '已请求取消（Deterministic Fake Runtime，非生产）',
  clarifyingSubmit: (preview) =>
    `已提交澄清输入（Deterministic Fake Runtime，非生产）：${preview}`,
  submitWithPreview: (preview) =>
    `已提交到 Deterministic Fake Runtime（非生产，不会调用远程 Agent Runtime）：${preview}`,
  waitingApproval:
    '当前 Run 等待审批。请在底部授权卡片选择「允许一次」或「拒绝」（Fake，无真实副作用）。',
  approvalApproved: '已允许一次（Fake 审批，非生产）',
  approvalRejected: '已拒绝（Fake 审批，非生产）',
  inputProvided: '已提供补充输入（Fake Runtime，非生产）',
  recovery: '检测到事件序号缺口，可尝试对账恢复（Fake reconcile）。',
  retryAccepted: '已重试 Turn（Fake Runtime，非生产）',
  queueAccepted: '已排队后续消息（Fake queue，非生产）',
  steerAccepted: '已发送转向（Fake steer，非生产）',
  reconcileAccepted: '已对账中断 Run（Fake reconcile，非生产）',
})

const VOLTAGENT: RuntimeHonestyCopy = buildCopy({
  // Generic until profile handshake; never claim remote production.
  // Office is the recommended profile (AGENT_PROFILE=office) but minimal may run.
  banner: '本机 VoltAgent Runtime · 非远程生产集群 · 本地侧车',
  timelineAriaLabel: '任务时间线（本机 VoltAgent Runtime）',
  contextItems: [
    '本机 VoltAgent Runtime',
    '非远程生产集群',
    '本地侧车（Office/minimal 由侧车 profile 决定）',
    'Fake ≠ 本机 Runtime',
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
})

export function runtimeHonestyCopy(
  mode: RuntimeHonestyMode = 'fake',
): RuntimeHonestyCopy {
  return mode === 'voltagent' ? VOLTAGENT : FAKE
}

export function previewText(text: string, max = 40): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
