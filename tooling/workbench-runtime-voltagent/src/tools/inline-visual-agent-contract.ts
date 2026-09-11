/**
 * Agent-facing writing contract for inline visuals (HTML cards in assistant prose).
 * Product job: docs/plans/workbench-agent-initiated-visualization.md
 * Do not copy WorkBuddy tool names (show_widget / Visualizer) or Claude Custom visuals wording.
 */

export const INLINE_VISUAL_INSTRUCTION_SENTENCES = [
  '行内视觉是助手正文里的 HTML 视觉卡，不是交互产物，也不是 mermaid 行内图。',
  '对比、优劣、双栏讲解、方案对照时：在助手 Markdown 写闭合 visual 围栏，里面是 HTML 片段（可内嵌 svg）。不要等用户点名 visual、html 或「画图」。不要用 mermaid subgraph、svg 围栏、html 围栏来出这张卡。',
  '用 title 标签写卡标题。对比用两列（grid 或 flex），每列一个标题加要点列表，列用不同浅底色。不要外链脚本、字体或图片。复杂主题拆成几张卡，卡与卡之间写一两句。不要交代「接下来画 visual」。',
  '流程图、时序、状态机走 mermaid。可筛选的表、要对着迭代的小应用走 interactive_*。短确认不出卡。',
] as const

export const INLINE_VISUAL_INSTRUCTIONS =
  INLINE_VISUAL_INSTRUCTION_SENTENCES.join(' ')
