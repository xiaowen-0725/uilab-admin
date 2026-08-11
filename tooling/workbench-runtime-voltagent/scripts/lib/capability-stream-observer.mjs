/**
 * Observe VoltAgent SSE data payloads without matching prompt/schema echoes.
 * A golden-path success requires an actual successful tool-result event.
 */
export function createToolStreamObserver(options) {
  const expectedToolName = options.toolName
  const inputMatches = options.inputMatches ?? (() => true)
  let expectedToolCalled = false
  let expectedToolSucceeded = false
  let expectedToolApprovalRequested = false
  let sawAnyToolActivity = false
  const observedToolNames = new Set()
  const matchedToolCallIds = new Set()

  function observeData(data) {
    let event
    try {
      event = JSON.parse(data)
    } catch {
      return
    }

    if (!event) {
      return
    }

    const nestedToolCall = event.toolCall
    const toolName =
      typeof event.toolName === 'string'
        ? event.toolName
        : typeof nestedToolCall?.toolName === 'string'
          ? nestedToolCall.toolName
          : null
    if (
      !toolName ||
      ![
        'tool-call',
        'tool-result',
        'tool-approval-request',
        'approval-requested',
      ].includes(event.type)
    ) {
      return
    }

    sawAnyToolActivity = true
    observedToolNames.add(toolName)
    if (toolName !== expectedToolName) return

    const input = event.input ?? nestedToolCall?.input
    const toolCallId = event.toolCallId ?? nestedToolCall?.toolCallId
    const matchesKnownCall =
      typeof toolCallId === 'string' && matchedToolCallIds.has(toolCallId)
    if (!matchesKnownCall && !inputMatches(input)) return
    if (typeof toolCallId === 'string') matchedToolCallIds.add(toolCallId)

    expectedToolCalled = true
    if (
      event.type === 'tool-approval-request' ||
      event.type === 'approval-requested'
    ) {
      expectedToolApprovalRequested = true
    }
    if (
      event.type === 'tool-result' &&
      (event.output?.success === true ||
        event.output?.exit_code === 0 ||
        event.output?.exitCode === 0)
    ) {
      expectedToolSucceeded = true
    }
  }

  function summary() {
    return {
      expectedToolName,
      expectedToolCalled,
      expectedToolSucceeded,
      expectedToolApprovalRequested,
      sawAnyToolActivity,
      observedToolNames: [...observedToolNames],
    }
  }

  return { observeData, summary }
}
