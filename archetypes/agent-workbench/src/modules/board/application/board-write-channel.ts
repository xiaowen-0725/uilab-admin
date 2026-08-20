/**
 * Client-side board_status / board_commit.
 * Pulls staging content, atomically persists, never returns HTML or job source.
 *
 * Query catalog is on board_status (not a new tool): identity is renderer-owned,
 * the recipe already starts here, and sidecar query HTTP is not a model tool.
 */

import { firstEmptySlot } from '../model/grid'
import { hashBoardContent } from '../model/content-hash'
import { assertNoEndpointLeak, containsEndpointLeak } from '../model/endpoint-leak'
import { queryBindingMatches, validateQueryBinding } from '../model/query-binding'
import {
  BOARD_WIDGET_LIMIT,
  DEFAULT_WIDGET_SPAN,
  type BoardId,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
  type WidgetDataSourceRecord,
} from '../model/types'
import type {
  BoardContentOk,
  BoardContentPort,
} from '../ports/board-content-port'
import type { BoardJobRuntimePort } from '../ports/board-job-runtime-port'
import type {
  BoardQueryCatalogEntry,
} from '../ports/board-query-catalog-port'
import type { IdentityScopeSnapshot } from '../ports/identity-scope-port'
import {
  UNRESTRICTED_AUTHORIZATION,
  type IdentityAuthorization,
} from '../ports/identity-scope-port'
import type { BoardStorePort } from '../ports/board-store-port'
import { anonymousIdentitySnapshot } from '../model/widget-render-state'
import { executeJobRun } from './board-refresh'

export type BoardToolFailure = {
  ok: false
  error: string
  hint: string
}

export type BoardStatusBoard = {
  id: string
  title: string
  widgetCount: number
  remaining: number
}

export type BoardStatusCommitted = {
  widgetId: string
  boardId: string
  contentHash: string
  jobId?: string
  codeHash?: string
  queryName?: string
}

export type BoardStatusQuery = BoardQueryCatalogEntry

export type BoardStatusResource = {
  type: string
  id: string
  name: string
  permissions: string[]
}

export type BoardStatusIdentity = {
  kind: 'unrestricted' | 'resources'
  valid: boolean
  resources: BoardStatusResource[]
}

export type BoardStatusStaging = {
  draftId: string
  kind: string
  status: string
  title: string
  widgetId?: string
  jobId?: string
  contentHash?: string
}

export type BoardStatusOk = {
  ok: true
  boards: BoardStatusBoard[]
  targetExists?: boolean
  committed: BoardStatusCommitted[]
  staging: BoardStatusStaging[]
  queries: BoardStatusQuery[]
  identity: BoardStatusIdentity
}

export type BoardCommitOk = {
  ok: true
  boardId: string
  widgetId: string
  mountId: string
  placement: { x: number; y: number; w: number; h: number }
  jobId?: string
  queryName?: string
  /** Same content already committed — no-op, skip first-run. */
  replayed?: true
}

export type BoardStatusInput = {
  boardId?: string
}

export type BoardCommitInput = {
  boardId?: string
  newBoardTitle?: string
  widgetId: string
  draftId?: string
  widgetDraftId?: string
  contentHash: string
  jobId?: string
  jobDraftId?: string
  codeHash?: string
  queryName?: string
  queryParams?: Record<string, unknown>
  taskId?: string
}

export type BoardWriteChannelExtras = {
  queries?: readonly BoardQueryCatalogEntry[]
  identity?: IdentityScopeSnapshot
}

export type BoardWriteClock = () => string

function fail(error: string, hint: string): BoardToolFailure {
  return { ok: false, error, hint }
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function pickDraftId(input: BoardCommitInput): string {
  return (input.draftId ?? input.widgetDraftId ?? '').trim()
}

function resultLooksLikeContentLeak(value: unknown): boolean {
  const text = JSON.stringify(value)
  return (
    text.includes('<html') ||
    text.includes('<!doctype') ||
    text.includes('export async function run') ||
    text.includes('export function run')
  )
}

export function assertNoContentLeak(value: unknown): void {
  if (resultLooksLikeContentLeak(value)) {
    throw new Error('board tool result leaked HTML or job source')
  }
}

export async function readBoardStatus(
  store: BoardStorePort,
  content: BoardContentPort | null,
  input: BoardStatusInput = {},
  extras: BoardWriteChannelExtras = {},
): Promise<BoardStatusOk> {
  const boards = await store.listBoards()
  const listed: BoardStatusBoard[] = boards.map((board) => ({
    id: board.id,
    title: board.title,
    widgetCount: board.placements.length,
    remaining: Math.max(0, BOARD_WIDGET_LIMIT - board.placements.length),
  }))

  const committed: BoardStatusCommitted[] = []
  for (const board of boards) {
    for (const placement of board.placements) {
      const widget = await store.getWidget(placement.widgetId)
      if (!widget) continue
      const job = await store.getJobByWidgetId(widget.id)
      const source = await store.getDataSourceByWidgetId(widget.id)
      committed.push({
        widgetId: widget.id,
        boardId: board.id,
        contentHash: await hashBoardContent(widget.html),
        jobId: job?.id,
        codeHash: job?.approved?.codeHash,
        queryName: source?.kind === 'query' ? source.queryName : undefined,
      })
    }
  }

  let staging: BoardStatusStaging[] = []
  if (content) {
    try {
      staging = [...(await content.listDrafts())]
    } catch {
      staging = []
    }
  }

  const targetId = input.boardId?.trim()
  const snapshot = extras.identity ?? anonymousIdentitySnapshot()
  const result: BoardStatusOk = {
    ok: true,
    boards: listed,
    committed,
    staging,
    queries: publicQueries(extras.queries ?? []),
    identity: publicIdentity(snapshot),
  }
  if (targetId) {
    result.targetExists = boards.some((board) => board.id === targetId)
  }
  assertNoContentLeak(result)
  assertNoEndpointLeak({ queries: result.queries, identity: result.identity })
  return result
}

export async function commitBoardDraft(
  store: BoardStorePort,
  content: BoardContentPort,
  input: BoardCommitInput,
  nowIso: BoardWriteClock = () => new Date().toISOString(),
  extras: BoardWriteChannelExtras = {},
): Promise<BoardCommitOk | BoardToolFailure> {
  const widgetId = input.widgetId.trim()
  const draftId = pickDraftId(input)
  const contentHash = input.contentHash.trim()
  if (!widgetId || !draftId || !contentHash) {
    return fail('validation_failed', 'board_commit 需要 widgetId、draftId 与 contentHash')
  }

  const jobId = input.jobId?.trim()
  const jobDraftId = input.jobDraftId?.trim()
  const codeHash = input.codeHash?.trim()
  const queryName = input.queryName?.trim()
  const queryParams = input.queryParams ?? {}
  const wantsJob = Boolean(jobId || jobDraftId || codeHash)
  const wantsQuery = Boolean(queryName)
  const jobReady = Boolean(jobId && jobDraftId && codeHash)
  if (wantsJob && wantsQuery) {
    return fail(
      'validation_failed',
      '作业与查询来源不能同时提交；业务数据用 queryName，公开数据用作业',
    )
  }
  if (wantsJob && !jobReady) {
    return fail(
      'build_not_ready',
      '提交作业需要同时提供 jobId、jobDraftId 与 codeHash；作业须先完成 board_job_finish 审批',
    )
  }

  const now = nowIso()
  let querySource: WidgetDataSourceRecord | undefined
  if (wantsQuery && queryName) {
    const bound = validateQueryBinding(
      extras.queries ?? [],
      { widgetId, queryName, params: queryParams, now },
      authorizationOf(extras.identity),
    )
    if (!bound.ok) return bound
    querySource = bound.source
  }

  const existingWidget = await store.getWidget(widgetId)
  const home = await findWidgetHome(store, widgetId)
  const resolved = await resolveBoard(store, input, home?.board.id, now)
  if (!resolved.ok) return resolved
  const { board, created } = resolved

  const existingPlacement = board.placements.find((item) => item.widgetId === widgetId)
  const existingSource = await store.getDataSourceByWidgetId(widgetId)
  if (
    existingWidget &&
    existingPlacement &&
    (await hashBoardContent(existingWidget.html)) === contentHash &&
    hashesMatch(await store.getJobByWidgetId(widgetId), codeHash) &&
    (!wantsQuery || queryBindingMatches(existingSource, queryName ?? '', queryParams))
  ) {
    return leakFreeCommit({
      ok: true,
      boardId: board.id,
      widgetId,
      mountId: existingPlacement.mountId,
      placement: pickPlacement(existingPlacement),
      jobId: jobId || undefined,
      queryName: existingSource?.kind === 'query' ? existingSource.queryName : queryName,
      replayed: true,
    })
  }

  if (!existingPlacement && board.placements.length >= BOARD_WIDGET_LIMIT) {
    return fail(
      'widget_limit_reached',
      `每块看板最多 ${BOARD_WIDGET_LIMIT} 个小组件，请换一块板或删掉现有小组件`,
    )
  }

  const widgetPull = await pullMatchingDraft(
    content,
    draftId,
    contentHash,
    '小组件 contentHash 与草稿不一致',
  )
  if (!widgetPull.ok) return widgetPull

  let jobPull: BoardContentOk | null = null
  if (jobReady && jobId && jobDraftId && codeHash) {
    const pulled = await pullMatchingDraft(
      content,
      jobDraftId,
      codeHash,
      '作业 codeHash 与草稿不一致',
    )
    if (!pulled.ok) return pulled
    jobPull = pulled
  }

  const placement: BoardPlacement = existingPlacement ?? {
    mountId: newId('m'),
    widgetId,
    ...firstEmptySlot(board.placements, DEFAULT_WIDGET_SPAN.default),
  }
  const widget = nextWidgetRecord(existingWidget, widgetPull, widgetId, input.taskId, now)
  let job: WidgetDataJobRecord | undefined
  if (jobPull && jobId) {
    const previous = await store.getJob(jobId) ?? await store.getJobByWidgetId(widgetId)
    job = nextJobRecord(previous, jobPull, { jobId, widgetId, taskId: input.taskId }, now)
  }

  const updating = Boolean(existingPlacement)
  const nextBoard: BoardRecord = {
    ...board,
    placements:
      created && !updating ? [...board.placements, placement] : board.placements,
    updatedAt: now,
    createdByTaskId: board.createdByTaskId ?? (created ? input.taskId : undefined),
  }

  if (querySource && existingSource) {
    querySource = {
      ...querySource,
      id: existingSource.id,
      createdAt: existingSource.createdAt,
    }
  }

  const leftoverJob =
    querySource ? await store.getJobByWidgetId(widgetId) : null

  await store.commitAtomically({
    board: nextBoard,
    widget,
    job,
    dataSource: querySource,
    appendPlacement: !updating && !created ? placement : undefined,
  })

  if (leftoverJob) await store.deleteJob(leftoverJob.id)

  return leakFreeCommit({
    ok: true,
    boardId: nextBoard.id,
    widgetId,
    mountId: placement.mountId,
    placement: pickPlacement(placement),
    jobId: job?.id,
    queryName: querySource?.queryName,
  })
}

export async function runCommittedJob(
  store: BoardStorePort,
  runtime: BoardJobRuntimePort,
  input: { jobId: string; widgetId: string },
  nowIso: BoardWriteClock = () => new Date().toISOString(),
): Promise<void> {
  await executeJobRun({
    store,
    runtime,
    jobId: input.jobId,
    widgetId: input.widgetId,
    mode: 'first-run',
    nowIso,
  })
}

function leakFreeCommit(result: BoardCommitOk): BoardCommitOk {
  assertNoContentLeak(result)
  return result
}

async function pullMatchingDraft(
  content: BoardContentPort,
  draftId: string,
  expectedHash: string,
  mismatchHint: string,
): Promise<BoardContentOk | BoardToolFailure> {
  const pulled = await content.pullReady(draftId)
  if (!pulled.ok) return pulled
  if (pulled.hash !== expectedHash) return fail('hash_mismatch', mismatchHint)
  return pulled
}

function nextWidgetRecord(
  existing: BoardWidgetRecord | null,
  pull: BoardContentOk,
  widgetId: string,
  taskId: string | undefined,
  now: string,
): BoardWidgetRecord {
  return {
    id: widgetId,
    title: pull.title || existing?.title || '小组件',
    html: pull.content,
    span: existing?.span ?? {
      min: { ...DEFAULT_WIDGET_SPAN.min },
      default: { ...DEFAULT_WIDGET_SPAN.default },
      max: { ...DEFAULT_WIDGET_SPAN.max },
    },
    latestData: existing?.latestData,
    latestDataAt: existing?.latestDataAt,
    status: existing?.status ?? 'idle',
    lastRunId: existing?.lastRunId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdByTaskId: existing?.createdByTaskId ?? taskId,
  }
}

function nextJobRecord(
  previous: WidgetDataJobRecord | null,
  pull: BoardContentOk,
  input: { jobId: string; widgetId: string; taskId?: string },
  now: string,
): WidgetDataJobRecord {
  return {
    id: input.jobId,
    widgetId: input.widgetId,
    title: pull.title || previous?.title || '取数作业',
    description: pull.description || previous?.description || '',
    enabled: previous?.enabled ?? true,
    approved: {
      code: pull.content,
      codeHash: pull.hash,
      allowedHosts: pull.allowedHosts ?? previous?.approved?.allowedHosts ?? [],
      approvedAt: now,
      approvedInTaskId: input.taskId ?? previous?.approved?.approvedInTaskId ?? '',
    },
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}

function pickPlacement(placement: BoardPlacement): {
  x: number
  y: number
  w: number
  h: number
} {
  return {
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
  }
}

function hashesMatch(
  job: WidgetDataJobRecord | null,
  codeHash?: string,
): boolean {
  if (!codeHash) return !job?.approved
  return job?.approved?.codeHash === codeHash
}

async function findWidgetHome(
  store: BoardStorePort,
  widgetId: string,
): Promise<{ board: BoardRecord; placement: BoardPlacement } | null> {
  for (const board of await store.listBoards()) {
    const placement = board.placements.find((item) => item.widgetId === widgetId)
    if (placement) return { board, placement }
  }
  return null
}

async function resolveBoard(
  store: BoardStorePort,
  input: BoardCommitInput,
  homeBoardId: string | undefined,
  now: string,
): Promise<
  | { ok: true; board: BoardRecord; created: boolean }
  | BoardToolFailure
> {
  const requested = input.boardId?.trim()
  if (requested) {
    const board = await store.getBoard(requested)
    if (!board) return fail('unknown_board', '目标看板不存在')
    return { ok: true, board, created: false }
  }
  if (homeBoardId) {
    const board = await store.getBoard(homeBoardId)
    if (board) return { ok: true, board, created: false }
  }
  const title = input.newBoardTitle?.trim() || '未命名看板'
  const board: BoardRecord = {
    id: newId('board'),
    title,
    isExample: false,
    placements: [],
    createdAt: now,
    updatedAt: now,
    createdByTaskId: input.taskId,
  }
  return { ok: true, board, created: true }
}

function publicQueries(
  queries: readonly BoardQueryCatalogEntry[],
): BoardStatusQuery[] {
  const listed: BoardStatusQuery[] = []
  for (const query of queries) {
    const entry: BoardStatusQuery = {
      name: query.name,
      title: query.title,
      parameters: query.parameters,
      requiredPermissions: [...query.requiredPermissions],
      referencableByJob: query.referencableByJob,
    }
    if (!containsEndpointLeak(entry)) listed.push(entry)
  }
  return listed
}

function publicIdentity(snapshot: IdentityScopeSnapshot): BoardStatusIdentity {
  if (snapshot.authorization.kind === 'unrestricted') {
    return { kind: 'unrestricted', valid: snapshot.valid, resources: [] }
  }
  return {
    kind: 'resources',
    valid: snapshot.valid,
    resources: snapshot.authorization.resources.map((resource) => ({
      type: resource.type,
      id: resource.id,
      name: resource.name,
      permissions: [...resource.permissions],
    })),
  }
}

function authorizationOf(
  snapshot: IdentityScopeSnapshot | undefined,
): IdentityAuthorization {
  return snapshot?.authorization ?? UNRESTRICTED_AUTHORIZATION
}

export type { BoardId }
