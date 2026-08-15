/**
 * Question Request answer contract (leaf, no React).
 * Used by ProvideRunInputCommand, projection meta, and adapter tool output.
 */

export type QuestionOption = { id: string; label: string }

export type QuestionAnswer =
  | { kind: 'options'; selectedOptionIds: string[]; otherText?: string }
  | { kind: 'skipped' }
  | { kind: 'freeText'; text: string }

export type QuestionRequest = {
  requestId: string
  question: string
  options: QuestionOption[]
  allowMultiple: boolean
}

export type QuestionToolOutput =
  | { status: 'answered'; selected: QuestionOption[]; other?: string }
  | { status: 'skipped' }
  | { status: 'replied'; text: string }

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionLabel(
  options: readonly QuestionOption[],
  id: string,
): string {
  return options.find((option) => option.id === id)?.label ?? id
}

export function formatQuestionAnswerLabel(
  answer: QuestionAnswer,
  options: readonly QuestionOption[] = [],
): string {
  if (answer.kind === 'skipped') return '已跳过'
  if (answer.kind === 'freeText') return `直接回复：${answer.text}`
  const parts = answer.selectedOptionIds.map((id) => optionLabel(options, id))
  if (answer.otherText) parts.push(`其他：${answer.otherText}`)
  return parts.join('、')
}

export function questionAnswerToInputText(
  answer: QuestionAnswer,
  options: readonly QuestionOption[] = [],
): string {
  if (answer.kind === 'freeText') return answer.text
  return formatQuestionAnswerLabel(answer, options)
}

export function questionAnswerToToolOutput(
  answer: QuestionAnswer,
  options: readonly QuestionOption[] = [],
): QuestionToolOutput {
  if (answer.kind === 'skipped') return { status: 'skipped' }
  if (answer.kind === 'freeText') return { status: 'replied', text: answer.text }
  const selected = answer.selectedOptionIds.map((id) => ({
    id,
    label: optionLabel(options, id),
  }))
  if (!answer.otherText) return { status: 'answered', selected }
  return { status: 'answered', selected, other: answer.otherText }
}

export function parseQuestionOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return []
  const options: QuestionOption[] = []
  for (const item of value) {
    const rec = asObjectRecord(item)
    if (!rec) continue
    const id = trimmedString(rec.id)
    const label = trimmedString(rec.label)
    if (!id || !label) continue
    options.push({ id, label })
  }
  return options
}

export function parseQuestionOptionsFromInput(input: unknown): QuestionOption[] {
  const rec = asObjectRecord(input)
  if (!rec) return []
  return parseQuestionOptions(rec.options)
}

export function parseQuestionRequest(
  payload: unknown,
  requestId: string,
): QuestionRequest | null {
  const rec = asObjectRecord(payload)
  if (!rec) return null
  const question = trimmedString(rec.question)
  const options = parseQuestionOptions(rec.options)
  if (!question || options.length === 0) return null
  return {
    requestId,
    question,
    options,
    allowMultiple:
      rec.allowMultiple === true || rec.allow_multiple === true,
  }
}

export function parseQuestionAnswer(value: unknown): QuestionAnswer | null {
  const rec = asObjectRecord(value)
  if (!rec) return null
  if (rec.kind === 'skipped') return { kind: 'skipped' }
  if (rec.kind === 'freeText' && typeof rec.text === 'string') {
    return { kind: 'freeText', text: rec.text }
  }
  if (rec.kind === 'options' && Array.isArray(rec.selectedOptionIds)) {
    const selectedOptionIds = rec.selectedOptionIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
    const otherText =
      typeof rec.otherText === 'string' && rec.otherText.trim()
        ? rec.otherText
        : undefined
    return { kind: 'options', selectedOptionIds, otherText }
  }
  return null
}
