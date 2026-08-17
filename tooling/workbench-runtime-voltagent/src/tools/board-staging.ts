/**
 * Disk staging for board widget / job drafts.
 * Layout: {stagingRoot}/{buildId}/meta.json + chunks/{seq} + assembled
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  BOARD_REPAIR_LIMIT,
  BOARD_STAGING_TTL_MS,
  boardToolError,
  isBoardToolError,
  repairBudgetExhausted,
  type BoardDraftKind,
  type BoardDraftMeta,
  type BoardToolError,
} from './board-types.js'

export type BoardStagingClock = () => number

export type CreateBoardStagingInput = {
  root: string
  now?: BoardStagingClock
  ttlMs?: number
}

type AppendOk = { received: number; nextSeq: number }
type FinishOk = { hash: string; bytes: number; content: string }

type DraftRef = {
  buildId: string
  expectedKind: BoardDraftKind
  ownerId: string
  ownerField: 'widgetId' | 'jobId'
}

const PRIVATE_FILE = { encoding: 'utf8' as const, mode: 0o600 }

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export class BoardStaging {
  readonly root: string
  private readonly now: BoardStagingClock
  private readonly ttlMs: number
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(input: CreateBoardStagingInput) {
    this.root = path.resolve(input.root)
    this.now = input.now ?? Date.now
    this.ttlMs = input.ttlMs ?? BOARD_STAGING_TTL_MS
  }

  async beginWidget(input: {
    title: string
    widgetId?: string
  }): Promise<{ widgetId: string; buildId: string }> {
    await this.sweepExpired()
    const widgetId = input.widgetId?.trim() || newId('w')
    const buildId = newId('b')
    await this.writeMeta(this.emptyMeta({
      kind: 'widget',
      buildId,
      widgetId,
      title: input.title.trim(),
    }))
    return { widgetId, buildId }
  }

  async beginJob(input: {
    widgetId: string
    title: string
    description: string
    allowedHosts: readonly string[]
  }): Promise<{ jobId: string; buildId: string }> {
    await this.sweepExpired()
    const jobId = newId('j')
    const buildId = newId('b')
    await this.writeMeta(this.emptyMeta({
      kind: 'job',
      buildId,
      widgetId: input.widgetId.trim(),
      jobId,
      title: input.title.trim(),
      description: input.description.trim(),
      allowedHosts: [...input.allowedHosts],
    }))
    return { jobId, buildId }
  }

  async append(
    input: DraftRef & { seq: number; chunk: string },
  ): Promise<AppendOk | BoardToolError> {
    return this.withLock(input.buildId, async () => {
      const draft = await this.requireDraft(input)
      if (isBoardToolError(draft)) return draft
      if (draft.status !== 'open') {
        return boardToolError('build_not_ready', '该草稿已结束，不能再追加')
      }
      if (!Number.isInteger(input.seq) || input.seq < 1) {
        return boardToolError('validation_failed', 'seq 必须从 1 起的正整数')
      }

      const chunkHash = hashText(input.chunk)
      const existing = draft.received[String(input.seq)]
      if (existing) {
        if (existing === chunkHash) {
          return { received: input.seq, nextSeq: draft.nextSeq }
        }
        return boardToolError(
          'validation_failed',
          `seq ${input.seq} 已写入且内容不同，重复 seq 仅在同内容时幂等`,
        )
      }
      if (input.seq !== draft.nextSeq) {
        return boardToolError(
          'validation_failed',
          `乱序 seq：缺第 ${draft.nextSeq} 段，当前收到 ${input.seq}`,
        )
      }

      await mkdir(this.chunkDir(input.buildId), { recursive: true })
      await writeFile(this.chunkPath(input.buildId, input.seq), input.chunk, PRIVATE_FILE)
      draft.received[String(input.seq)] = chunkHash
      draft.nextSeq = input.seq + 1
      this.touch(draft)
      await this.writeMeta(draft)
      return { received: input.seq, nextSeq: draft.nextSeq }
    })
  }

  async finish(
    input: DraftRef & {
      validate: (
        content: string,
        meta: BoardDraftMeta,
      ) => { ok: true } | BoardToolError
    },
  ): Promise<(FinishOk & { meta: BoardDraftMeta }) | BoardToolError> {
    return this.withLock(input.buildId, async () => {
      const draft = await this.requireDraft(input)
      if (isBoardToolError(draft)) return draft
      if (draft.status === 'consumed') {
        return boardToolError('build_not_ready', '该草稿已被拉取，不能再 finish')
      }
      if (draft.validationFailures >= BOARD_REPAIR_LIMIT + 1) {
        return repairBudgetExhausted()
      }
      if (draft.nextSeq <= 1) {
        return this.recordFailure(
          draft,
          boardToolError('build_not_ready', '还没有追加任何分片，无法 finish'),
        )
      }

      const content = await this.assemble(input.buildId, draft)
      const checked = input.validate(content, draft)
      if (checked.ok !== true) return this.recordFailure(draft, checked)

      const contentHash = hashText(content)
      const bytes = Buffer.byteLength(content, 'utf8')
      await writeFile(this.assembledPath(input.buildId), content, PRIVATE_FILE)
      draft.status = 'ready'
      draft.contentHash = contentHash
      draft.bytes = bytes
      this.touch(draft)
      await this.writeMeta(draft)
      return { hash: contentHash, bytes, content, meta: draft }
    })
  }

  async readReadyContent(buildId: string): Promise<
    | {
        content: string
        hash: string
        bytes: number
        kind: BoardDraftKind
        title: string
        description?: string
        allowedHosts?: string[]
        widgetId?: string
        jobId?: string
      }
    | BoardToolError
  > {
    return this.withLock(buildId, async () => {
      const loaded = await this.loadMeta(buildId)
      if (!loaded) return boardToolError('unknown_build', '未知的草稿')
      if (this.isExpired(loaded)) {
        await rm(this.draftDir(buildId), { recursive: true, force: true })
        return boardToolError('unknown_build', '草稿已过期或不存在，请重新 begin / finish')
      }
      if (loaded.status === 'consumed') {
        return boardToolError('build_not_ready', '该草稿已被拉取，不可二次读取')
      }
      if (loaded.status !== 'ready' || !loaded.contentHash || loaded.bytes == null) {
        return boardToolError('build_not_ready', '草稿尚未 finish，不能拉取内容')
      }
      const content = await readFile(this.assembledPath(buildId), 'utf8')
      loaded.status = 'consumed'
      this.touch(loaded)
      await this.writeMeta(loaded)
      await rm(this.assembledPath(buildId), { force: true })
      return {
        content,
        hash: loaded.contentHash,
        bytes: loaded.bytes,
        kind: loaded.kind,
        title: loaded.title,
        description: loaded.description,
        allowedHosts: loaded.allowedHosts,
        widgetId: loaded.widgetId,
        jobId: loaded.jobId,
      }
    })
  }

  async listDrafts(): Promise<
    Array<{
      draftId: string
      kind: BoardDraftKind
      status: BoardDraftMeta['status']
      title: string
      widgetId?: string
      jobId?: string
      contentHash?: string
    }>
  > {
    await this.sweepExpired()
    let names: string[]
    try {
      names = await readdir(this.root)
    } catch {
      return []
    }
    const drafts = await Promise.all(
      names.map(async (name) => {
        const meta = await this.loadMeta(name)
        if (!meta || meta.status === 'consumed') return null
        return {
          draftId: meta.buildId,
          kind: meta.kind,
          status: meta.status,
          title: meta.title,
          widgetId: meta.widgetId,
          jobId: meta.jobId,
          contentHash: meta.contentHash,
        }
      }),
    )
    return drafts.filter((row) => row !== null)
  }

  async sweepExpired(): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.root)
    } catch {
      return
    }
    await Promise.all(
      names.map(async (name) => {
        const meta = await this.loadMeta(name)
        if (!meta) {
          await rm(this.draftDir(name), { recursive: true, force: true })
          return
        }
        if (this.isExpired(meta) || meta.status === 'consumed') {
          await rm(this.draftDir(name), { recursive: true, force: true })
        }
      }),
    )
  }

  private emptyMeta(input: {
    kind: BoardDraftKind
    buildId: string
    widgetId?: string
    jobId?: string
    title: string
    description?: string
    allowedHosts?: string[]
  }): BoardDraftMeta {
    const stamp = new Date(this.now()).toISOString()
    return {
      kind: input.kind,
      buildId: input.buildId,
      widgetId: input.widgetId,
      jobId: input.jobId,
      title: input.title,
      description: input.description,
      allowedHosts: input.allowedHosts,
      nextSeq: 1,
      received: {},
      validationFailures: 0,
      status: 'open',
      createdAt: stamp,
      updatedAt: stamp,
    }
  }

  private async requireDraft(ref: DraftRef): Promise<BoardDraftMeta | BoardToolError> {
    const loaded = await this.loadMeta(ref.buildId)
    if (!loaded) return boardToolError('unknown_build', '未知的 buildId，请先调用 begin')
    if (loaded.kind !== ref.expectedKind) {
      return boardToolError('unknown_build', 'buildId 与工具面不匹配')
    }
    if (loaded[ref.ownerField] !== ref.ownerId) {
      return boardToolError('unknown_build', 'id 与 buildId 不匹配')
    }
    return loaded
  }

  private isExpired(meta: BoardDraftMeta): boolean {
    const updated = Date.parse(meta.updatedAt)
    return !Number.isFinite(updated) || updated < this.now() - this.ttlMs
  }

  private touch(meta: BoardDraftMeta): void {
    meta.updatedAt = new Date(this.now()).toISOString()
  }

  private async recordFailure(
    meta: BoardDraftMeta,
    error: BoardToolError,
  ): Promise<BoardToolError> {
    meta.validationFailures += 1
    this.touch(meta)
    await this.writeMeta(meta)
    if (meta.validationFailures >= BOARD_REPAIR_LIMIT + 1) {
      return repairBudgetExhausted()
    }
    return error
  }

  private async assemble(buildId: string, meta: BoardDraftMeta): Promise<string> {
    const parts: string[] = []
    for (let seq = 1; seq < meta.nextSeq; seq += 1) {
      parts.push(await readFile(this.chunkPath(buildId, seq), 'utf8'))
    }
    return parts.join('')
  }

  private async loadMeta(buildId: string): Promise<BoardDraftMeta | null> {
    try {
      const raw = await readFile(this.metaPath(buildId), 'utf8')
      const parsed = JSON.parse(raw) as BoardDraftMeta
      if (!parsed || parsed.buildId !== buildId) return null
      return parsed
    } catch {
      return null
    }
  }

  private async writeMeta(meta: BoardDraftMeta): Promise<void> {
    const dir = this.draftDir(meta.buildId)
    await mkdir(dir, { recursive: true })
    await writeFile(this.metaPath(meta.buildId), JSON.stringify(meta), PRIVATE_FILE)
  }

  private draftDir(buildId: string): string {
    return path.join(this.root, buildId)
  }

  private metaPath(buildId: string): string {
    return path.join(this.draftDir(buildId), 'meta.json')
  }

  private chunkDir(buildId: string): string {
    return path.join(this.draftDir(buildId), 'chunks')
  }

  private chunkPath(buildId: string, seq: number): string {
    return path.join(this.chunkDir(buildId), String(seq))
  }

  private assembledPath(buildId: string): string {
    return path.join(this.draftDir(buildId), 'assembled')
  }

  private async withLock<T>(buildId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(buildId) ?? Promise.resolve()
    let release: () => void = () => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const gate = previous.then(() => current)
    this.locks.set(buildId, gate)
    await previous
    try {
      return await work()
    } finally {
      release()
      if (this.locks.get(buildId) === gate) this.locks.delete(buildId)
    }
  }
}
