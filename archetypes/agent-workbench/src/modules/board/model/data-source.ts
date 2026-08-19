/**
 * Widget Data Source helpers — construction, leftover v3 inference, snapshot view.
 */

import {
  ANONYMOUS_PRINCIPAL_KEY,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
  type WidgetDataSnapshotRecord,
  type WidgetDataSourceRecord,
  type WidgetDataSourceTrigger,
} from './types'

export function dataSourceIdForWidget(widgetId: string): string {
  return `source:${widgetId}`
}

export function snapshotStorageKey(
  widgetId: string,
  principalKey: string,
): string {
  return `${widgetId}\0${principalKey}`
}

export function persistableWidgetRow(
  widget: BoardWidgetRecord,
): BoardWidgetRecord {
  const { latestData: _data, latestDataAt: _at, ...row } = widget
  return row
}

export function hydrateWidgetFromSnapshot(
  widget: BoardWidgetRecord,
  snapshot: WidgetDataSnapshotRecord | null | undefined,
  principalKey = ANONYMOUS_PRINCIPAL_KEY,
): BoardWidgetRecord {
  if (snapshot) {
    return {
      ...persistableWidgetRow(widget),
      latestData: snapshot.data,
      latestDataAt: snapshot.capturedAt,
    }
  }
  if (
    principalKey === ANONYMOUS_PRINCIPAL_KEY &&
    widget.latestData !== undefined
  ) {
    return widget
  }
  return persistableWidgetRow(widget)
}

export function snapshotFromWidgetCompat(
  widget: BoardWidgetRecord,
  principalKey = ANONYMOUS_PRINCIPAL_KEY,
): WidgetDataSnapshotRecord | null {
  if (widget.latestData === undefined) return null
  return {
    widgetId: widget.id,
    principalKey,
    data: widget.latestData,
    capturedAt: widget.latestDataAt ?? widget.updatedAt,
  }
}

export function leftoverJobTrigger(
  job: WidgetDataJobRecord,
): WidgetDataSourceTrigger {
  return job.trigger ?? { kind: 'manual' }
}

export function dataSourceFromJob(
  job: WidgetDataJobRecord,
  now = job.updatedAt,
): WidgetDataSourceRecord {
  return {
    id: dataSourceIdForWidget(job.widgetId),
    widgetId: job.widgetId,
    kind: 'job',
    trigger: leftoverJobTrigger(job),
    referencableByJob: false,
    jobId: job.id,
    createdAt: job.createdAt,
    updatedAt: now,
  }
}

export function createPresetDataSource(
  widgetId: string,
  now: string,
): WidgetDataSourceRecord {
  return {
    id: dataSourceIdForWidget(widgetId),
    widgetId,
    kind: 'preset',
    trigger: { kind: 'manual' },
    referencableByJob: false,
    createdAt: now,
    updatedAt: now,
  }
}
