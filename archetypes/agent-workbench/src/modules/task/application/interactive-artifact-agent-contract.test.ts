import { describe, expect, it } from 'vitest'
import {
  INTERACTIVE_ALL_TOOL_NAMES,
  INTERACTIVE_CLIENT_TOOL_NAMES,
  INTERACTIVE_INSTRUCTION_SENTENCES,
  INTERACTIVE_SIDECAR_TOOL_NAMES,
  INTERACTIVE_TOOL_DESCRIPTIONS,
  INTERACTIVE_TOOL_INSTRUCTIONS,
  isInteractiveClientTool,
} from './interactive-artifact-agent-contract'
import {
  INTERACTIVE_INSTRUCTION_SENTENCES as SIDECAR_SENTENCES,
  INTERACTIVE_TOOL_DESCRIPTIONS as SIDECAR_DESCRIPTIONS,
  INTERACTIVE_TOOL_INSTRUCTIONS as SIDECAR_INSTRUCTIONS,
  INTERACTIVE_ALL_TOOL_NAMES as SIDECAR_TOOL_NAMES,
} from '../../../../../../tooling/workbench-runtime-voltagent/src/tools/interactive-artifact-agent-contract.ts'

describe('interactive artifact agent contract', () => {
  it('locks interactive_* names and never reuses board_*', () => {
    expect([...INTERACTIVE_CLIENT_TOOL_NAMES]).toEqual(['interactive_commit'])
    expect([...INTERACTIVE_SIDECAR_TOOL_NAMES]).toEqual([
      'interactive_begin',
      'interactive_append',
      'interactive_finish',
    ])
    expect(INTERACTIVE_ALL_TOOL_NAMES.some((name) => name.startsWith('board_'))).toBe(
      false,
    )
    expect(isInteractiveClientTool('interactive_commit')).toBe(true)
    expect(isInteractiveClientTool('board_commit')).toBe(false)
    expect(INTERACTIVE_TOOL_INSTRUCTIONS).toBe(
      INTERACTIVE_INSTRUCTION_SENTENCES.join(' '),
    )
    expect(INTERACTIVE_TOOL_INSTRUCTIONS).toContain('interactive_begin')
    expect(INTERACTIVE_TOOL_INSTRUCTIONS).not.toContain('Canvas')
    for (const name of INTERACTIVE_ALL_TOOL_NAMES) {
      expect(INTERACTIVE_TOOL_DESCRIPTIONS[name]).toBeTruthy()
    }
  })

  it('stays identical to the sidecar lock file', () => {
    expect([...SIDECAR_TOOL_NAMES]).toEqual([...INTERACTIVE_ALL_TOOL_NAMES])
    expect([...SIDECAR_SENTENCES]).toEqual([...INTERACTIVE_INSTRUCTION_SENTENCES])
    expect(SIDECAR_INSTRUCTIONS).toBe(INTERACTIVE_TOOL_INSTRUCTIONS)
    expect(SIDECAR_DESCRIPTIONS).toEqual(INTERACTIVE_TOOL_DESCRIPTIONS)
  })
})
