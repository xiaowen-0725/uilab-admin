/**
 * 正文晋升门（§6.3）。纯函数，直播和回放同一套。
 * 阈值写在 view，不进事件信封。
 */

export type StreamGate = 'none' | 'hold' | 'quiet' | 'answer'

export const STREAM_GATE_THRESHOLD = 120

export type StreamGateInput = {
  charCount: number
  hasProcess: boolean
  toolActive: boolean
  messageCompleted: boolean
  threshold: number
  hitlPending: boolean
  isFinalMessage: boolean
}

export function nextStreamGate(
  prev: StreamGate,
  input: StreamGateInput,
): StreamGate {
  // 升过不要降回 hold / quiet：用户已经看见正文。
  if (prev === 'answer') return 'answer'
  if (input.isFinalMessage) {
    if (input.charCount > 0) return 'answer'
    return 'none'
  }
  if (input.messageCompleted) {
    if (input.charCount > 0) return 'quiet'
    return 'none'
  }
  if (
    input.charCount >= input.threshold &&
    !input.toolActive &&
    !input.hitlPending
  ) {
    return 'answer'
  }
  if (input.hasProcess || input.toolActive || input.hitlPending) return 'quiet'
  if (input.charCount > 0) return 'hold'
  return 'none'
}

export function isAssistantStreaming(status: string | undefined): boolean {
  return status === 'streaming' || status === 'running'
}
