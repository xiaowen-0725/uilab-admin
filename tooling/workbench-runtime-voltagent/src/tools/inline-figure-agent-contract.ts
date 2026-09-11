/**
 * Agent-facing writing contract for inline figures (mermaid).
 * Product job: docs/plans/workbench-agent-initiated-visualization.md
 *
 * Comparison / explanation cards are inline visuals, not mermaid.
 * Do not copy WorkBuddy tool names or wording.
 */

export const INLINE_FIGURE_INSTRUCTION_SENTENCES = [
  '行内图是助手正文里嵌着的静图，不是交互产物，也不是行内视觉。',
  '流程图、时序图、状态机、架构关系需要一眼看懂时：在助手 Markdown 里写闭合的 mermaid 围栏（flowchart、sequenceDiagram、stateDiagram 等）。不要等用户点名 mermaid 或「画图」。不要用 mermaid subgraph 做对比卡，不要用 Markdown 表凑合流程。',
  '计划、步骤、关系同样用 mermaid。复杂主题拆成几张小图，图与图之间写一两句说明。用自然的一句带过，不要交代「接下来画 mermaid」。',
  '不要用 svg 围栏、裸 svg 标签、或写一个图文件来当行内图。短确认、查词不出图。',
  '对比、优劣、双栏讲解走行内视觉。可筛选的表、可点的清单、表单、需要迭代的小应用走 interactive_*。',
] as const

export const INLINE_FIGURE_INSTRUCTIONS =
  INLINE_FIGURE_INSTRUCTION_SENTENCES.join(' ')
