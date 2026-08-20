/**
 * Widget Data Source helpers — construction, leftover v3 inference, snapshot view.
 */

import type { BoardQueryCatalogEntry } from '../ports/board-query-catalog-port'
import {
  ANONYMOUS_PRINCIPAL_KEY,
  widgetStatusForRun,
  type BoardWidgetRecord,
  type DataSourceResourceParameterDecl,
  type WidgetDataJobRecord,
  type WidgetDataSnapshotRecord,
  type WidgetDataSourceRecord,
  type WidgetJobRunRecord,
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

export function dataSourceFromJob(
  job: WidgetDataJobRecord,
  now = job.updatedAt,
): WidgetDataSourceRecord {
  return {
    id: dataSourceIdForWidget(job.widgetId),
    widgetId: job.widgetId,
    kind: 'job',
    trigger: job.trigger ?? { kind: 'manual' },
    referencableByJob: false,
    jobId: job.id,
    createdAt: job.createdAt,
    updatedAt: now,
  }
}

export function dataSourceFromQuery(
  widgetId: string,
  query: BoardQueryCatalogEntry,
  params: Record<string, unknown>,
  now: string,
): WidgetDataSourceRecord {
  const parameterSchema: Record<string, DataSourceResourceParameterDecl> = {}
  for (const [key, decl] of Object.entries(query.parameters)) {
    if (decl.type === 'resource') {
      parameterSchema[key] = {
        type: 'resource',
        resourceType: decl.resourceType,
        ...(decl.requiredPermissions?.length
          ? { requiredPermissions: [...decl.requiredPermissions] }
          : {}),
      }
    }
  }
  return {
    id: dataSourceIdForWidget(widgetId),
    widgetId,
    kind: 'query',
    trigger: { kind: 'onOpen' },
    parameters: { ...params },
    parameterSchema,
    requiredPermissions: [...query.requiredPermissions],
    referencableByJob: query.referencableByJob,
    queryName: query.name,
    createdAt: now,
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

export function jobSourceWrite(
  existing: WidgetDataSourceRecord | null | undefined,
  job: WidgetDataJobRecord,
): { next: WidgetDataSourceRecord; staleId?: string } | null {
  if (existing?.kind === 'job' && existing.jobId === job.id) return null
  const next = dataSourceFromJob(job)
  return {
    next,
    staleId: existing && existing.id !== next.id ? existing.id : undefined,
  }
}

export function missingPresetSource(
  existing: WidgetDataSourceRecord | null | undefined,
  widget: BoardWidgetRecord,
): WidgetDataSourceRecord | null {
  if (existing) return null
  return createPresetDataSource(widget.id, widget.updatedAt)
}

export function widgetRowAfterRun(
  widget: BoardWidgetRecord,
  run: WidgetJobRunRecord,
): BoardWidgetRecord {
  const occurredAt = run.finishedAt ?? run.startedAt
  return persistableWidgetRow({
    ...widget,
    status: widgetStatusForRun(run.status),
    lastRunId: run.id,
    updatedAt: occurredAt,
  })
}

export function successSnapshotForRun(
  widgetId: string,
  run: WidgetJobRunRecord,
  data: unknown | undefined,
  principalKey = ANONYMOUS_PRINCIPAL_KEY,
): WidgetDataSnapshotRecord | null {
  if (run.status !== 'success' || data === undefined) return null
  return {
    widgetId,
    principalKey,
    data,
    capturedAt: run.finishedAt ?? run.startedAt,
  }
}
