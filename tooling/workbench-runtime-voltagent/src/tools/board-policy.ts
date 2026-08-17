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

export const BOARD_CLIENT_TOOLS = ['board_status', 'board_commit'] as const

export const BOARD_ALL_TOOLS = [
  ...BOARD_SIDECAR_TOOLS,
  ...BOARD_CLIENT_TOOLS,
] as const

export type BoardSidecarToolName = (typeof BOARD_SIDECAR_TOOLS)[number]
export type BoardClientToolName = (typeof BOARD_CLIENT_TOOLS)[number]

/** The five tools that auto-approve; board_job_finish stays off this list. */
export const BOARD_AUTO_APPROVE_TOOLS = BOARD_SIDECAR_TOOLS.filter(
  (name) => name !== BOARD_JOB_FINISH_TOOL,
)

export type BoardAutoApproveToolName = (typeof BOARD_AUTO_APPROVE_TOOLS)[number]
