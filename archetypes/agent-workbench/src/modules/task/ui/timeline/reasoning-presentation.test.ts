import { describe, expect, it } from 'vitest'
import { reasoningLabel, reasoningPreview } from './reasoning-presentation'

describe('reasoning presentation', () => {
  it('uses live copy while streaming and settled copy when done', () => {
    expect(reasoningLabel(true)).toBe('思考中…')
    expect(reasoningLabel(false)).toBe('深度思考')
  })

  it('previews the latest non-empty thought line', () => {
    expect(reasoningPreview(undefined)).toBeUndefined()
    expect(reasoningPreview('   ')).toBeUndefined()
    expect(reasoningPreview('先确认轨道。\n\n倾角随机 2-7 度。')).toBe(
      '倾角随机 2-7 度。',
    )
  })
})
