/**
 * Pure VoltAgent fullStream chunk → AgentRuntimeEventEnvelope mapper.
 * No network; used by VoltAgentRuntimeAdapter and unit tests.
 */

import {
  AGENT_RUNTIME_SCHEMA_VERSION,
  type AgentRuntimeEventEnvelope,
} from '@/modules/task'
import {
  normalizeToolOutput,
  parseQuestionOptionsFromInput,
  sanitizeToolOutputForEnvelope,
} from '@/modules/task'

export interface MapFullStreamContext {
  projectId: string
  taskId: string
  turnId: string

  /** Next taskSequence (1-based). Mapper increments from this value. */
  nextSequence: number
  schemaVersion?: number
  /** ISO clock; default Date.now for adapter, fixed in tests. */
  nowIso?: () => string
  eventIdPrefix?: string
  /**
   * In-flight `update_plan` toolCallIds. The mapper mutates this set so the
   * adapter can suppress the matching tool-result across SSE chunks.
   */
  updatePlanCallIds?: Set<string>
}

export type FullStreamChunk = {
  type: string
  [key: string]: unknown
}

export interface MapFullStreamResult {
  envelopes: AgentRuntimeEventEnvelope[]
  nextSequence: number
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

const MAX_ERROR_DEPTH = 3
const MAX_ERROR_RESPONSE_BODY_LENGTH = 64 * 1024

function extractResponseBodyErrorMessage(
  value: unknown,
  depth: number,
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > MAX_ERROR_RESPONSE_BODY_LENGTH
  ) {
    return undefined
  }
  try {
    return extractErrorMessage(JSON.parse(value), depth + 1)
  } catch {
    return undefined
  }
}

function extractErrorMessage(
  value: unknown,
  depth = 0,
): string | undefined {
  if (depth > MAX_ERROR_DEPTH) return undefined
  if (value instanceof Error) return value.message || undefined
  if (typeof value === 'string') return value || undefined
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  return (
    asString(record.message) ??
    extractErrorMessage(record.error, depth + 1) ??
    extractErrorMessage(record.cause, depth + 1) ??
    extractErrorMessage(record.data, depth + 1) ??
    extractResponseBodyErrorMessage(record.responseBody, depth)
  )
}

function toolName(chunk: FullStreamChunk): string {
  return asString(chunk.toolName) ?? asString(chunk.name) ?? 'tool'
}

function toolCallId(chunk: FullStreamChunk): string {
  return asString(chunk.toolCallId) ?? asString(chunk.id) ?? 'tool-call'
}

function textDelta(chunk: FullStreamChunk): string {
  return asString(chunk.delta) ?? asString(chunk.text) ?? ''
}

function isShellTool(name: string): boolean {
  return /^(bash|shell|exec|run_command|runCommand|execute_command)$/i.test(name)
}

/**
 * Tools that mutate files and should synthesize `file.changed` after success.
 * Covers DIY tools and VoltAgent Workspace FS toolkit names.
 */
function isWriteTool(name: string): boolean {
  return /^(write|write_file|writeFile|create_file|createFile|edit|edit_file|editFile|delete_file|deleteFile|rmdir)$/i.test(
    name,
  )
}

function isDeleteTool(name: string): boolean {
  return /^(delete_file|deleteFile|rmdir)$/i.test(name)
}

function isEditTool(name: string): boolean {
  return /^(edit|edit_file|editFile)$/i.test(name)
}

function fileChangeKind(name: string): 'created' | 'updated' | 'deleted' {
  if (isDeleteTool(name)) return 'deleted'
  if (isEditTool(name)) return 'updated'
  return 'created'
}

function isUpdatePlanTool(name: string): boolean {
  return name === 'update_plan'
}

function isAskUserQuestionTool(name: string): boolean {
  return name === 'ask_user_question'
}

function parseAskUserQuestionArgs(args: unknown): {
  question: string
  options: Array<{ id: string; label: string }>
  allowMultiple: boolean
} {
  const rec = asRecord(args)
  const question =
    typeof rec.question === 'string' && rec.question.trim()
      ? rec.question.trim()
      : '请选择'
  return {
    question,
    options: parseQuestionOptionsFromInput(args),
    allowMultiple: rec.allow_multiple === true || rec.allowMultiple === true,
  }
}

function planCallIds(ctx: MapFullStreamContext): Set<string> {
  if (!ctx.updatePlanCallIds) ctx.updatePlanCallIds = new Set()
  return ctx.updatePlanCallIds
}

function rememberUpdatePlanCall(
  ctx: MapFullStreamContext,
  callId: string,
): void {
  planCallIds(ctx).add(callId)
}

function consumeUpdatePlanCall(
  ctx: MapFullStreamContext,
  name: string,
  callId: string,
): boolean {
  const ids = planCallIds(ctx)
  if (ids.has(callId) || isUpdatePlanTool(name)) {
    ids.delete(callId)
    return true
  }
  return false
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function updatePlanWarningPayload(
  name: string,
  callId: string,
  error: unknown,
): {
  title: string
  message: string
  toolCallId: string
  toolName: string
} {
  return {
    title: '计划更新失败',
    message: extractErrorMessage(error) ?? '未知错误',
    toolCallId: callId,
    toolName: name,
  }
}

function planUpdatedPayload(args: unknown): {
  explanation?: string
  steps: unknown
} {
  const rec = asRecord(args)
  const explanation =
    typeof rec.explanation === 'string' && rec.explanation.length > 0
      ? rec.explanation
      : undefined
  const steps = rec.plan ?? rec.steps ?? []
  if (explanation === undefined) return { steps }
  return { explanation, steps }
}

function extractToolPath(
  args: unknown,
  output: unknown,
): string | undefined {
  const fromRecord = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null) return undefined
    const rec = value as Record<string, unknown>
    for (const key of ['path', 'file_path', 'filePath', 'filepath'] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v.length > 0) return v
    }
    return undefined
  }
  return fromRecord(args) ?? fromRecord(output)
}

/**
 * Map a single chunk. May emit 0..n envelopes (e.g. write tool → tool + file.changed).
 */
export function mapFullStreamChunk(
  chunk: FullStreamChunk,
  ctx: MapFullStreamContext,
): MapFullStreamResult {
  const envelopes: AgentRuntimeEventEnvelope[] = []
  let seq = ctx.nextSequence
  const schemaVersion = ctx.schemaVersion ?? AGENT_RUNTIME_SCHEMA_VERSION
  const nowIso = ctx.nowIso ?? (() => new Date().toISOString())
  const prefix = ctx.eventIdPrefix ?? 'va'
  let idCounter = 0

  const push = (eventType: string, payload: unknown): void => {
    const occurredAt = nowIso()
    envelopes.push({
      eventId: `${prefix}-${ctx.turnId}-${seq}-${idCounter++}`,
      eventType,
      schemaVersion,
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      turnId: ctx.turnId,

      taskSequence: seq,
      occurredAt,
      receivedAt: occurredAt,
      payload,
    })
    seq += 1
  }

  const type = String(chunk.type ?? '')

  switch (type) {
    case 'start':
      // Adapter owns turn.started at submit; stream start is a no-op.
      break

    case 'start-step':
      push('step.started', {
        stepId: asString(chunk.id) ?? asString(chunk.stepId),
        chunkType: type,
      })
      break

    case 'finish-step':
      push('step.completed', {
        stepId: asString(chunk.id) ?? asString(chunk.stepId),
        finishReason: chunk.finishReason,
        chunkType: type,
      })
      break

    case 'text-start':
      push('message.started', {
        id: asString(chunk.id),
        chunkType: type,
      })
      break

    case 'text-delta': {
      const delta = textDelta(chunk)
      if (delta) {
        push('message.delta', {
          text: delta,
          delta,
        })
      }
      break
    }

    case 'text-end':
      push('message.completed', {
        text: asString(chunk.content) ?? asString(chunk.text) ?? '',
      })
      break

    case 'reasoning-start':
      push('reasoning.started', { id: asString(chunk.id) })
      break

    case 'reasoning-delta': {
      const delta = textDelta(chunk)
      if (delta) push('reasoning.delta', { text: delta, delta })
      break
    }

    case 'reasoning-end':
      push('reasoning.completed', { id: asString(chunk.id) })
      break

    case 'tool-call': {
      const name = toolName(chunk)
      const callId = toolCallId(chunk)
      const args = chunk.args ?? chunk.input ?? chunk.arguments
      if (isAskUserQuestionTool(name)) {
        const parsed = parseAskUserQuestionArgs(args)
        push('input.requested', {
          requestId: callId,
          question: parsed.question,
          options: parsed.options,
          allowMultiple: parsed.allowMultiple,
        })
        break
      }
      if (isUpdatePlanTool(name)) {
        rememberUpdatePlanCall(ctx, callId)
        push('plan.updated', planUpdatedPayload(args))
        break
      }
      if (isShellTool(name)) {
        push('command.started', {
          commandId: callId,
          toolId: callId,
          toolCallId: callId,
          toolName: name,
          name,
          label: name,
          command: typeof args === 'object' && args && 'command' in args
            ? String((args as { command: unknown }).command)
            : JSON.stringify(args ?? {}),
          args,
        })
      } else {
        push('tool.started', {
          toolId: callId,
          toolCallId: callId,
          toolName: name,
          name,
          label: name,
          args,
          toolKind: 'generic',
        })
      }
      break
    }

    case 'tool-result': {
      const name = toolName(chunk)
      const callId = toolCallId(chunk)
      const output = chunk.output ?? chunk.result ?? chunk.content
      if (isAskUserQuestionTool(name)) {
        break
      }
      if (consumeUpdatePlanCall(ctx, name, callId)) {
        if (chunk.isError === true || chunk.error != null) {
          push(
            'warning',
            updatePlanWarningPayload(name, callId, chunk.error ?? output),
          )
        }
        break
      }
      const args = chunk.args ?? chunk.input ?? chunk.arguments
      const isError = chunk.isError === true || chunk.error != null
      const normalized = normalizeToolOutput(output)
      // Path extraction uses raw `output`; envelope residual is size-bound + redacted.
      // Keep args so projection can format natural-language tool titles (P2).
      const completedBase = {
        toolId: callId,
        toolCallId: callId,
        toolName: name,
        name,
        label: name,
        args,
        output: sanitizeToolOutputForEnvelope(output),
        summary: normalized.summary,
        items: normalized.items,
        isError,
      }

      if (isShellTool(name)) {
        push('command.completed', {
          ...completedBase,
          commandId: callId,
          command:
            typeof args === 'object' &&
            args &&
            'command' in (args as object)
              ? String((args as { command: unknown }).command)
              : undefined,
        })
      } else {
        push('tool.completed', {
          ...completedBase,
          status: isError ? 'error' : 'completed',
        })
      }

      // Synthesize file.changed for write/edit/delete tools when path is known.
      if (!isError && isWriteTool(name)) {
        const filePath = extractToolPath(args, output)
        if (filePath) {
          const changeKind = fileChangeKind(name)
          const additions =
            changeKind === 'deleted'
              ? undefined
              : typeof output === 'object' &&
                  output &&
                  typeof (output as { additions?: unknown }).additions === 'number'
                ? (output as { additions: number }).additions
                : undefined
          const deletions =
            changeKind === 'deleted'
              ? undefined
              : typeof output === 'object' &&
                  output &&
                  typeof (output as { deletions?: unknown }).deletions === 'number'
                ? (output as { deletions: number }).deletions
                : undefined
          push('file.changed', {
            path: filePath,
            changeKind,
            ...(additions != null ? { additions } : {}),
            ...(deletions != null ? { deletions } : {}),
            toolCallId: callId,
            toolName: name,
          })
        }
      }
      break
    }

    case 'tool-output-denied':
    case 'tool-error': {
      const name = toolName(chunk)
      const callId = toolCallId(chunk)
      const error = chunk.error ?? chunk.message ?? chunk.output
      if (isAskUserQuestionTool(name)) {
        break
      }
      if (consumeUpdatePlanCall(ctx, name, callId)) {
        push('warning', updatePlanWarningPayload(name, callId, error))
        break
      }
      const denied = type === 'tool-output-denied'
      const failed = error ?? (denied ? 'tool output denied' : 'tool error')
      const completed = {
        toolId: callId,
        toolCallId: callId,
        toolName: name,
        name,
        error: failed,
        summary: normalizeToolOutput(failed).summary,
        isError: true,
        status: denied ? 'denied' : 'error',
      }
      if (isShellTool(name)) {
        push('command.completed', { ...completed, commandId: callId })
      } else {
        push('tool.completed', completed)
      }
      break
    }

    case 'finish':
      push('turn.completed', {
        outcome: 'completed',
        finishReason: chunk.finishReason,
        usage: chunk.usage,
      })
      break

    case 'abort':
      push('turn.cancelled', {
        reason: asString(chunk.reason) ?? asString(chunk.message) ?? 'aborted',
      })
      break

    case 'error':
      push('turn.failed', {
        message:
          asString(chunk.message) ??
          extractErrorMessage(chunk.error) ??
          'runtime error',
        error: chunk.error,
      })
      break

    case 'source':
      // v2 dropped source.grouped; ignore citation chunks.
      break

    // Approval is often UI-message stream; support explicit chunk types if present.
    // VoltAgent AI SDK shape: { type: 'tool-approval-request', approvalId, toolCall: { toolCallId, toolName, input } }
    case 'tool-approval-request':
    case 'approval-requested': {
      const nested =
        typeof chunk.toolCall === 'object' && chunk.toolCall !== null
          ? (chunk.toolCall as FullStreamChunk)
          : undefined
      const nestedName = nested ? toolName(nested) : undefined
      const nestedCallId = nested ? toolCallId(nested) : undefined
      const nestedArgs = nested
        ? (nested.args ?? nested.input ?? nested.arguments)
        : undefined
      push('approval.requested', {
        requestId:
          asString(chunk.approvalId) ??
          asString(chunk.requestId) ??
          asString(chunk.id) ??
          nestedCallId ??
          toolCallId(chunk),
        toolName: nestedName ?? toolName(chunk),
        toolCallId: nestedCallId ?? toolCallId(chunk),
        args: nestedArgs ?? chunk.args ?? chunk.input,
      })
      break
    }

    default:
      // Unknown chunk types: safe no-op (do not crash the stream).
      break
  }

  return { envelopes, nextSequence: seq }
}

/**
 * Map an ordered list of chunks (e.g. recorded fullStream).
 * Does not emit turn.started — Adapter owns submit bookkeeping.
 */
export function mapFullStreamChunks(
  chunks: readonly FullStreamChunk[],
  ctx: MapFullStreamContext,
): MapFullStreamResult {
  let nextSequence = ctx.nextSequence
  const envelopes: AgentRuntimeEventEnvelope[] = []
  const updatePlanCallIds = ctx.updatePlanCallIds ?? new Set<string>()
  for (const chunk of chunks) {
    const step = mapFullStreamChunk(chunk, {
      ...ctx,
      nextSequence,
      updatePlanCallIds,
    })
    envelopes.push(...step.envelopes)
    nextSequence = step.nextSequence
  }
  return { envelopes, nextSequence }
}
