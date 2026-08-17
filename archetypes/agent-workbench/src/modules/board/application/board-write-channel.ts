/**
 * Client-side board_status / board_commit.
 * Pulls staging content, atomically persists, never returns HTML or job source.
 */

import { firstEmptySlot } from '../model/grid'
import { hashBoardContent } from '../model/content-hash'
import {
  BOARD_WIDGET_LIMIT,
  DEFAULT_WIDGET_SPAN,
  type BoardId,
  type BoardPlacement,
  type BoardRecord,
  type BoardWidgetRecord,
  type WidgetDataJobRecord,
} from '../model/types'
import type { BoardContentPort } from '../ports/board-content-port'
import type { BoardJobRuntimePort } from '../ports/board-job-runtime-port'
import type { BoardStorePort } from '../ports/board-store-port'

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
}

export type BoardCommitOk = {
  ok: true
  boardId: string
  widgetId: string
  mountId: string
  placement: { x: number; y: number; w: number; h: number }
  jobId?: string
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
  taskId?: string
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
      committed.push({
        widgetId: widget.id,
        boardId: board.id,
        contentHash: await hashBoardContent(widget.html),
        jobId: job?.id,
        codeHash: job?.approved?.codeHash,
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
  const result: BoardStatusOk = {
    ok: true,
    boards: listed,
    committed,
    staging,
  }
  if (targetId) {
    result.targetExists = boards.some((board) => board.id === targetId)
  }
  assertNoContentLeak(result)
  return result
}

export async function commitBoardDraft(
  store: BoardStorePort,
  content: BoardContentPort,
  input: BoardCommitInput,
  nowIso: BoardWriteClock = () => new Date().toISOString(),
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
  if (jobId || jobDraftId || codeHash) {
    if (!jobId || !jobDraftId || !codeHash) {
      return fail(
        'build_not_ready',
        '提交作业需要同时提供 jobId、jobDraftId 与 codeHash；作业须先完成 board_job_finish 审批',
      )
    }
  }

  const now = nowIso()
  const existingWidget = await store.getWidget(widgetId)
  const home = await findWidgetHome(store, widgetId)
  const resolved = await resolveBoard(store, input, home?.board.id, now)
  if (!resolved.ok) return resolved
  const { board, created } = resolved

  const existingPlacement = board.placements.find((item) => item.widgetId === widgetId)
  if (
    existingWidget &&
    existingPlacement &&
    (await hashBoardContent(existingWidget.html)) === contentHash &&
    hashesMatch(await store.getJobByWidgetId(widgetId), codeHash)
  ) {
    const result: BoardCommitOk = {
      ok: true,
      boardId: board.id,
      widgetId,
      mountId: existingPlacement.mountId,
      placement: pickPlacement(existingPlacement),
      jobId: jobId || undefined,
      replayed: true,
    }
    assertNoContentLeak(result)
    return result
  }

  if (!existingPlacement && board.placements.length >= BOARD_WIDGET_LIMIT) {
    return fail(
      'widget_limit_reached',
      `每块看板最多 ${BOARD_WIDGET_LIMIT} 个小组件，请换一块板或删掉现有小组件`,
    )
  }

  const widgetPull = await content.pullReady(draftId)
  if (!widgetPull.ok) return widgetPull
  if (widgetPull.hash !== contentHash) {
    return fail('hash_mismatch', '小组件 contentHash 与草稿不一致')
  }

  let jobPull: Awaited<ReturnType<BoardContentPort['pullReady']>> | null = null
  if (jobId && jobDraftId && codeHash) {
    jobPull = await content.pullReady(jobDraftId)
    if (!jobPull.ok) return jobPull
    if (jobPull.hash !== codeHash) {
      return fail('hash_mismatch', '作业 codeHash 与草稿不一致')
    }
  }

  const slot = existingPlacement
    ? pickPlacement(existingPlacement)
    : firstEmptySlot(board.placements, DEFAULT_WIDGET_SPAN.default)
  const placement: BoardPlacement = existingPlacement ?? {
    mountId: newId('m'),
    widgetId,
    ...slot,
  }

  const widget: BoardWidgetRecord = {
    id: widgetId,
    title: widgetPull.title || existingWidget?.title || '小组件',
    html: widgetPull.content,
    span: existingWidget?.span ?? {
      min: { ...DEFAULT_WIDGET_SPAN.min },
      default: { ...DEFAULT_WIDGET_SPAN.default },
      max: { ...DEFAULT_WIDGET_SPAN.max },
    },
    latestData: existingWidget?.latestData,
    latestDataAt: existingWidget?.latestDataAt,
    status: existingWidget?.status ?? 'idle',
    lastRunId: existingWidget?.lastRunId,
    createdAt: existingWidget?.createdAt ?? now,
    updatedAt: now,
    createdByTaskId: existingWidget?.createdByTaskId ?? input.taskId,
  }

  let job: WidgetDataJobRecord | undefined
  if (jobPull?.ok && jobId) {
    const previous = await store.getJob(jobId) ?? await store.getJobByWidgetId(widgetId)
    job = {
      id: jobId,
      widgetId,
      title: jobPull.title || previous?.title || '取数作业',
      description: jobPull.description || previous?.description || '',
      enabled: previous?.enabled ?? true,
      trigger: { kind: 'manual' },
      approved: {
        code: jobPull.content,
        codeHash: jobPull.hash,
        allowedHosts: jobPull.allowedHosts ?? previous?.approved?.allowedHosts ?? [],
        approvedAt: now,
        approvedInTaskId: input.taskId ?? previous?.approved?.approvedInTaskId ?? '',
      },
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
  }

  const nextBoard: BoardRecord = {
    ...board,
    placements: existingPlacement
      ? board.placements
      : created
        ? [...board.placements, placement]
        : board.placements,
    updatedAt: now,
    createdByTaskId: board.createdByTaskId ?? (created ? input.taskId : board.createdByTaskId),
  }

  await store.commitAtomically({
    board: nextBoard,
    widget,
    job,
    appendPlacement: existingPlacement || created ? undefined : placement,
  })

  const result: BoardCommitOk = {
    ok: true,
    boardId: nextBoard.id,
    widgetId,
    mountId: placement.mountId,
    placement: pickPlacement(placement),
    jobId: job?.id,
  }
  assertNoContentLeak(result)
  return result
}

export async function runCommittedJob(
  store: BoardStorePort,
  runtime: BoardJobRuntimePort,
  input: { jobId: string; widgetId: string },
  nowIso: BoardWriteClock = () => new Date().toISOString(),
): Promise<void> {
  if (runtime.available === false) return
  const startedAt = nowIso()
  const runId = newId('run')
  await store.recordRun({
    id: runId,
    jobId: input.jobId,
    widgetId: input.widgetId,
    startedAt,
    status: 'running',
  })
  const result = await runtime.runJob(input.jobId)
  const finishedAt = nowIso()
  if (result.ok) {
    await store.recordRun(
      {
        id: runId,
        jobId: input.jobId,
        widgetId: input.widgetId,
        startedAt,
        finishedAt,
        status: 'success',
      },
      result.payload,
    )
    return
  }
  await store.recordRun({
    id: runId,
    jobId: input.jobId,
    widgetId: input.widgetId,
    startedAt,
    finishedAt,
    status: 'error',
    errorMessage: result.hint,
  })
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

export type { BoardId }
