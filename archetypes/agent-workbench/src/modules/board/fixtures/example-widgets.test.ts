import { describe, expect, it } from 'vitest'
import { validateWidgetSource } from '../../../../../../tooling/workbench-runtime-voltagent/src/tools/board-validation.ts'
import { BOARD_WIDGET_LIMIT } from '../model/types'
import { EXAMPLE_PRESETS, listExampleWidgets } from './example-presets'

describe('example widgets as board_widget_finish live samples', () => {
  it('passes the Ticket E validator for every example widget', () => {
    const widgets = listExampleWidgets()
    expect(widgets.length).toBeGreaterThan(0)
    for (const widget of widgets) {
      expect(validateWidgetSource(widget.html), widget.title).toEqual({ ok: true })
    }
  })

  it('keeps both example boards under the per-board widget cap and job-free', () => {
    expect(EXAMPLE_PRESETS).toHaveLength(2)
    for (const preset of EXAMPLE_PRESETS) {
      expect(preset.widgets.length).toBeGreaterThan(0)
      expect(preset.widgets.length).toBeLessThanOrEqual(BOARD_WIDGET_LIMIT)
    }
  })
})
