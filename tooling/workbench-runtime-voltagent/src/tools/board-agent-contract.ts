/**
 * Board agent-facing contract (spec §6.1–§6.3):
 * Layer C instructions, Layer A tool descriptions, and per-Turn tool gating.
 */

import { BOARD_ALL_TOOLS } from './board-policy.js'

export const BOARD_FEATURE_ID = 'board' as const

export const BOARD_INSTRUCTION_SENTENCES = [
  'Board 是用户长期持有的看板资产：工具面出现 board_* 时先读 board-widget skill，再按配方分片写入。',
  '小组件不能联网：公开数据经取数作业（board_job_finish 会停靠审批，不要把停靠当失败）；业务数据先看 board_status 目录，对照 requiredPermissions 与资源 permissions 再 commit 绑定，不要编端点。',
  '工具面没有 board_* 时不得声称能做看板——board-widget 仍可能出现在技能列表里。',
] as const

export const BOARD_TOOL_INSTRUCTIONS = BOARD_INSTRUCTION_SENTENCES.join(' ')

export const BOARD_TOOL_DESCRIPTIONS = {
  board_status:
    '配方第一步：只读权威状态与指标目录。权威在渲染层 IndexedDB，不要猜已有板。' +
    '可选 boardId 确认目标是否存在。返回 boards、committed、staging，以及 queries（含 requiredPermissions）与 identity.resources（含 permissions）。' +
    '权限不足的指标仍会出现，先对照再选；不要编指标名或端点。' +
    '新建或续写前先问本工具。不得与 board_commit 并行。返回不含 HTML。',
  board_widget_begin:
    '配方第二步：开始一块看板小组件的分片写入。内容只落在侧车 staging，不进用户工作区，也不进 IndexedDB。' +
    '传入 title；改已有小组件时带上同一 widgetId。必须使用返回的真实 widgetId 与 buildId，禁止编造。' +
    '随后按 seq 从 1 连续调用 board_widget_append（每片 2–4KB），全部写完再 board_widget_finish。' +
    '本步免审批。返回只有 id，不含 HTML。写作规范见 board-widget skill，不要写在本工具参数里。',
  board_widget_append:
    '配方第三步：向当前小组件草稿追加一片 HTML。前置：已成功 board_widget_begin，且持有真实 widgetId 与 buildId。' +
    'seq 必须从 1 严格递增；同内容重复 seq 幂等忽略，不同内容或乱序会报错并指明缺哪一段——只补那一段，不要整份重写。' +
    '每片 2–4KB。返回 received 与 nextSeq，不含 HTML。写完所有分片后调用 board_widget_finish，不要在中途 commit。',
  board_widget_finish:
    '配方第四步：结束小组件分片写入并做静态校验。前置：seq 连续且内容已齐。成功后得到 widgetId、contentHash、bytes，绝不回 HTML。' +
    '失败只回错误码与一句 hint；同一草稿最多自修 2 次。校验通过后若需要外部数据，再走作业三步；否则直接 board_commit。' +
    '写作规范与错误码自查见 board-widget skill，本工具 description 不讲写法，只讲前后件。',
  board_job_begin:
    '作业配方第一步：为指定小组件开始编写取数作业。前置：小组件通常已 finish。' +
    'allowedHosts 必须在此刻声明，之后与代码一起进入 board_job_finish 审批。' +
    '只能访问此刻声明过的主机。返回 jobId 与 buildId，必须原样使用，禁止编造。' +
    '随后按 seq 从 1 连续 append，再 finish。本步免审批。前后件与写法细则见 board-widget skill。',
  board_job_append:
    '作业配方第二步：向当前取数作业草稿追加一片代码。前置：已成功 board_job_begin。' +
    'seq 规则与 board_widget_append 相同：从 1 连续，同内容重复幂等，不同内容或乱序报错并指明缺段。' +
    '每片 2–4KB。返回 received 与 nextSeq，不含代码正文。全部写完后必须调用 board_job_finish；' +
    '该步会停靠用户审批，不要把停靠当成失败，也不要在 finish 之前 commit。',
  board_job_finish:
    '作业配方第三步：结束作业分片写入、静态校验并请求用户批准。前置：代码已齐且 allowedHosts 已在 begin 声明。' +
    '这是 board 族唯一需要审批的工具：批准后同一份代码可被重复静默执行，不再逐次确认。' +
    '失败只回错误码与 hint；成功返回 jobId 与 codeHash，不含代码。同一草稿最多自修 2 次。' +
    '停靠审批不是失败，不要重试本工具。full-access 预设下可能不出现审批卡。获批后再 board_commit。',
  board_commit:
    '配方最后一步：提交已 finish 的小组件。可带已获批作业，或绑定 queryName 与 queryParams，二者互斥。' +
    '前置：widget finish 已成功；作业须 board_job_finish 已获批；查询须目录里有该指标且资源权限覆盖 requiredPermissions。' +
    '传入 draftId 与 contentHash。boardId 缺省时用 newBoardTitle 建新板。一次调用写完，禁止并行。' +
    '返回 id/placement，不含 HTML。宿主会打开预览并自动首跑。',
} as const satisfies Record<(typeof BOARD_ALL_TOOLS)[number], string>

export function assembleTurnTools<C, B = C>(input: {
  connectorTools: readonly C[]
  resolveBoardTools: () => readonly B[]
  selectedFeatureIds: readonly string[]
}): Array<C | B> {
  return [
    ...input.connectorTools,
    ...(input.selectedFeatureIds.includes(BOARD_FEATURE_ID)
      ? input.resolveBoardTools()
      : []),
  ]
}
