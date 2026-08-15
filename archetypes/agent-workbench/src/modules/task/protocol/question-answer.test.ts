import { describe, expect, it } from 'vitest'
import {
  formatQuestionAnswerLabel,
  parseQuestionAnswer,
  parseQuestionOptionsFromInput,
  parseQuestionRequest,
  questionAnswerToInputText,
  questionAnswerToToolOutput,
} from './question-answer'

const options = [
  { id: 'formal', label: '正式' },
  { id: 'casual', label: '轻松' },
]

describe('question-answer helpers', () => {
  it('formats option / other / skip / free-text labels', () => {
    expect(
      formatQuestionAnswerLabel(
        { kind: 'options', selectedOptionIds: ['formal', 'casual'] },
        options,
      ),
    ).toBe('正式、轻松')
    expect(
      formatQuestionAnswerLabel(
        {
          kind: 'options',
          selectedOptionIds: ['formal'],
          otherText: '更短一些',
        },
        options,
      ),
    ).toBe('正式、其他：更短一些')
    expect(formatQuestionAnswerLabel({ kind: 'skipped' })).toBe('已跳过')
    expect(
      formatQuestionAnswerLabel({ kind: 'freeText', text: '按你的建议' }),
    ).toBe('直接回复：按你的建议')
  })

  it('builds tool output with labels so the model need not look them up', () => {
    expect(
      questionAnswerToToolOutput(
        { kind: 'options', selectedOptionIds: ['casual'], otherText: '再活泼点' },
        options,
      ),
    ).toEqual({
      status: 'answered',
      selected: [{ id: 'casual', label: '轻松' }],
      other: '再活泼点',
    })
    expect(questionAnswerToToolOutput({ kind: 'skipped' })).toEqual({
      status: 'skipped',
    })
    expect(
      questionAnswerToToolOutput({ kind: 'freeText', text: '都行' }),
    ).toEqual({ status: 'replied', text: '都行' })
  })

  it('keeps free-text inputText as the raw reply', () => {
    expect(
      questionAnswerToInputText({ kind: 'freeText', text: '按你的建议' }),
    ).toBe('按你的建议')
    expect(
      questionAnswerToInputText({ kind: 'skipped' }),
    ).toBe('已跳过')
  })

  it('parses structured request and answer payloads defensively', () => {
    expect(
      parseQuestionRequest(
        {
          question: '用哪种语气？',
          options,
          allowMultiple: true,
        },
        'call-1',
      ),
    ).toEqual({
      requestId: 'call-1',
      question: '用哪种语气？',
      options,
      allowMultiple: true,
    })
    expect(parseQuestionRequest({ prompt: '旧形态' }, 'call-2')).toBeNull()
    expect(parseQuestionAnswer({ kind: 'skipped' })).toEqual({ kind: 'skipped' })
    expect(parseQuestionAnswer({ kind: 'options', selectedOptionIds: ['a'] })).toEqual({
      kind: 'options',
      selectedOptionIds: ['a'],
      otherText: undefined,
    })
    expect(parseQuestionAnswer({ kind: 'unknown' })).toBeNull()
  })

  it('reads options from a tool-input object', () => {
    expect(parseQuestionOptionsFromInput({ options })).toEqual(options)
    expect(parseQuestionOptionsFromInput(null)).toEqual([])
    expect(parseQuestionOptionsFromInput({ options: 'nope' })).toEqual([])
  })
})
