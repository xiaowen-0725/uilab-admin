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

export function formatQuestionAnswerLabel(
  answer: QuestionAnswer,
  options: readonly QuestionOption[] = [],
): string {
  if (answer.kind === 'skipped') return '已跳过'
  if (answer.kind === 'freeText') return `直接回复：${answer.text}`
  const labels = answer.selectedOptionIds.map(
    (id) => options.find((option) => option.id === id)?.label ?? id,
  )
  const parts = [...labels]
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
    label: options.find((option) => option.id === id)?.label ?? id,
  }))
  return answer.otherText
    ? { status: 'answered', selected, other: answer.otherText }
    : { status: 'answered', selected }
}

export function parseQuestionOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return []
  const options: QuestionOption[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id.trim() : ''
    const label = typeof rec.label === 'string' ? rec.label.trim() : ''
    if (!id || !label) continue
    options.push({ id, label })
  }
  return options
}

export function parseQuestionRequest(
  payload: unknown,
  requestId: string,
): QuestionRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  const question =
    typeof rec.question === 'string' ? rec.question.trim() : ''
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
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
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
