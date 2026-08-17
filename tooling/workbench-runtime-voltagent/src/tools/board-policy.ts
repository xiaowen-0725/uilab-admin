/**
 * ToolPolicy for the sidecar board family (spec §5.4).
 * board_job_finish is the only write that grants a new capability.
 */

export const BOARD_JOB_FINISH_TOOL = 'board_job_finish' as const

export const BOARD_SIDECAR_TOOLS = [
  'board_widget_begin',
  'board_widget_append',
  'board_widget_finish',
  'board_job_begin',
  'board_job_append',
  BOARD_JOB_FINISH_TOOL,
] as const

export type BoardSidecarToolName = (typeof BOARD_SIDECAR_TOOLS)[number]

/** The five tools that auto-approve; board_job_finish stays off this list. */
export const BOARD_AUTO_APPROVE_TOOLS = [
  'board_widget_begin',
  'board_widget_append',
  'board_widget_finish',
  'board_job_begin',
  'board_job_append',
] as const

export type BoardAutoApproveToolName = (typeof BOARD_AUTO_APPROVE_TOOLS)[number]

export type BoardToolPolicy = {
  name: BoardSidecarToolName
  needsApproval: boolean
  autoApprove: boolean
}

export const BOARD_TOOL_POLICY: readonly BoardToolPolicy[] = BOARD_SIDECAR_TOOLS.map(
  (name) => ({
    name,
    needsApproval: name === BOARD_JOB_FINISH_TOOL,
    autoApprove: name !== BOARD_JOB_FINISH_TOOL,
  }),
)
