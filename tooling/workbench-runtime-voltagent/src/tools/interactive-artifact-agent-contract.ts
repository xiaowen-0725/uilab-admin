/**
 * Interactive Artifact agent-facing contract (locked for #182 / wired in #185).
 * Keep identical to Task module `interactive-artifact-agent-contract.ts`.
 * Do not inject Layer C into system-prompt until begin/append/finish execute.
 */

export const INTERACTIVE_CLIENT_TOOL_NAMES = ['interactive_commit'] as const

export const INTERACTIVE_SIDECAR_TOOL_NAMES = [
  'interactive_begin',
  'interactive_append',
  'interactive_finish',
] as const

export const INTERACTIVE_ALL_TOOL_NAMES = [
  ...INTERACTIVE_SIDECAR_TOOL_NAMES,
  ...INTERACTIVE_CLIENT_TOOL_NAMES,
] as const

export type InteractiveArtifactToolName =
  (typeof INTERACTIVE_ALL_TOOL_NAMES)[number]

export const INTERACTIVE_INSTRUCTION_SENTENCES = [
  '交互产物是本次 Task 旁边的可交互 HTML 视图，不是看板，也不是工作区文件。',
  '用户要可筛选的表、对比清单、可点的图，或明确说「交互产物」时：interactive_begin → append → finish → interactive_commit；禁止 write_file 一个 .html 来「打开」，禁止用 board_* 冒充，禁止把整表摊进聊天。',
  '更新同一份必须带上次 commit 返回的 artifactId；省略 id 且内容 hash 已存在则回放，不铸新份。没有 interactive_* 时不得声称能做。',
] as const

export const INTERACTIVE_TOOL_INSTRUCTIONS =
  INTERACTIVE_INSTRUCTION_SENTENCES.join(' ')

export const INTERACTIVE_TOOL_DESCRIPTIONS = {
  interactive_begin:
    '开始一份交互产物的分片写入。内容只落在侧车 staging，不进用户工作区，也不进事件。' +
    '可选 title；改已有产物时带上同一 artifactId。省略 id 则铸新份。' +
    '必须使用返回的真实 artifactId 与 draftId，禁止编造。' +
    '随后按 seq 从 1 连续 interactive_append（每片 2–4KB），全部写完再 interactive_finish。' +
    '本步免审批。返回只有 id，不含 HTML。',
  interactive_append:
    '向当前交互产物草稿追加一片 HTML。前置：已成功 interactive_begin。' +
    'seq 必须从 1 严格递增；同内容重复 seq 幂等忽略，不同内容或乱序会报错。' +
    '每片 2–4KB。返回 received 与 nextSeq，不含 HTML。' +
    '写完所有分片后调用 interactive_finish，不要在中途 commit。',
  interactive_finish:
    '结束交互产物分片写入。前置：seq 连续且内容已齐。' +
    '成功后得到 artifactId、contentHash、bytes，绝不回 HTML。' +
    '随后必须 interactive_commit；commit 在渲染层执行，不要把 HTML 再传一遍。',
  interactive_commit:
    '配方最后一步：提交已 finish 的交互产物到当前 Task。' +
    '传入 draftId、contentHash、title。更新同一份必须带上次返回的 artifactId；' +
    '省略 id 且内容 hash 已存在则回放，不铸新份。一次调用写完，禁止并行。' +
    '返回 artifactId/title/updated，不含 HTML。taskId 由宿主绑定，不要当作参数传入。',
} as const satisfies Record<InteractiveArtifactToolName, string>
