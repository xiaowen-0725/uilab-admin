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

  async append(input: {
    buildId: string
    expectedKind: BoardDraftKind
    ownerId: string
    ownerField: 'widgetId' | 'jobId'
    seq: number
    chunk: string
  }): Promise<AppendOk | BoardToolError> {
    return this.withLock(input.buildId, async () => {
      const loaded = await this.loadMeta(input.buildId)
      if (!loaded) return boardToolError('unknown_build', '未知的 buildId，请先调用 begin')
      if (loaded.kind !== input.expectedKind) {
        return boardToolError('unknown_build', 'buildId 与工具面不匹配')
      }
      if (loaded[input.ownerField] !== input.ownerId) {
        return boardToolError('unknown_build', 'id 与 buildId 不匹配')
      }
      if (loaded.status !== 'open') {
        return boardToolError('build_not_ready', '该草稿已结束，不能再追加')
      }
      if (!Number.isInteger(input.seq) || input.seq < 1) {
        return boardToolError('validation_failed', 'seq 必须从 1 起的正整数')
      }

      const chunkHash = hashText(input.chunk)
      const existing = loaded.received[String(input.seq)]
      if (existing) {
        if (existing === chunkHash) {
          return { received: input.seq, nextSeq: loaded.nextSeq }
        }
        return boardToolError(
          'validation_failed',
          `seq ${input.seq} 已写入且内容不同，重复 seq 仅在同内容时幂等`,
        )
      }
      if (input.seq !== loaded.nextSeq) {
        return boardToolError(
          'validation_failed',
          `乱序 seq：缺第 ${loaded.nextSeq} 段，当前收到 ${input.seq}`,
        )
      }

      await mkdir(this.chunkDir(input.buildId), { recursive: true })
      await writeFile(this.chunkPath(input.buildId, input.seq), input.chunk, {
        encoding: 'utf8',
        mode: 0o600,
      })
      loaded.received[String(input.seq)] = chunkHash
      loaded.nextSeq = input.seq + 1
      loaded.updatedAt = new Date(this.now()).toISOString()
      await this.writeMeta(loaded)
      return { received: input.seq, nextSeq: loaded.nextSeq }
    })
  }

  async finish(input: {
    buildId: string
    expectedKind: BoardDraftKind
    ownerId: string
    ownerField: 'widgetId' | 'jobId'
    validate: (content: string, meta: BoardDraftMeta) =>
      | { ok: true }
      | BoardToolError
  }): Promise<(FinishOk & { meta: BoardDraftMeta }) | BoardToolError> {
    return this.withLock(input.buildId, async () => {
      const loaded = await this.loadMeta(input.buildId)
      if (!loaded) return boardToolError('unknown_build', '未知的 buildId，请先调用 begin')
      if (loaded.kind !== input.expectedKind) {
        return boardToolError('unknown_build', 'buildId 与工具面不匹配')
      }
      if (loaded[input.ownerField] !== input.ownerId) {
        return boardToolError('unknown_build', 'id 与 buildId 不匹配')
      }
      if (loaded.status === 'consumed') {
        return boardToolError('build_not_ready', '该草稿已被拉取，不能再 finish')
      }
      if (loaded.validationFailures >= BOARD_REPAIR_LIMIT + 1) {
        return boardToolError(
          'repair_budget_exhausted',
          '同一草稿连续校验失败已达上限，请停止重试并向用户说明问题、换方案',
        )
      }
      if (loaded.nextSeq <= 1) {
        return this.recordFailure(
          loaded,
          boardToolError('build_not_ready', '还没有追加任何分片，无法 finish'),
        )
      }

      const content = await this.assemble(input.buildId, loaded)
      const checked = input.validate(content, loaded)
      if (checked.ok !== true) {
        return this.recordFailure(loaded, checked)
      }

      const contentHash = hashText(content)
      const bytes = Buffer.byteLength(content, 'utf8')
      await writeFile(this.assembledPath(input.buildId), content, {
        encoding: 'utf8',
        mode: 0o600,
      })
      loaded.status = 'ready'
      loaded.contentHash = contentHash
      loaded.bytes = bytes
      loaded.updatedAt = new Date(this.now()).toISOString()
      await this.writeMeta(loaded)
      return { hash: contentHash, bytes, content, meta: loaded }
    })
  }

  async readReadyContent(buildId: string): Promise<
    | { content: string; hash: string; bytes: number; kind: BoardDraftKind }
    | BoardToolError
  > {
    return this.withLock(buildId, async () => {
      const loaded = await this.loadMeta(buildId)
      if (!loaded) return boardToolError('unknown_build', '未知的草稿')
      if (loaded.status === 'consumed') {
        return boardToolError('build_not_ready', '该草稿已被拉取，不可二次读取')
      }
      if (loaded.status !== 'ready' || !loaded.contentHash || loaded.bytes == null) {
        return boardToolError('build_not_ready', '草稿尚未 finish，不能拉取内容')
      }
      const content = await readFile(this.assembledPath(buildId), 'utf8')
      loaded.status = 'consumed'
      loaded.updatedAt = new Date(this.now()).toISOString()
      await this.writeMeta(loaded)
      await rm(this.assembledPath(buildId), { force: true })
      return {
        content,
        hash: loaded.contentHash,
        bytes: loaded.bytes,
        kind: loaded.kind,
      }
    })
  }

  async sweepExpired(): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.root)
    } catch {
      return
    }
    const cutoff = this.now() - this.ttlMs
    await Promise.all(
      names.map(async (name) => {
        const meta = await this.loadMeta(name)
        if (!meta) {
          await rm(this.draftDir(name), { recursive: true, force: true })
          return
        }
        const updated = Date.parse(meta.updatedAt)
        if (!Number.isFinite(updated) || updated < cutoff || meta.status === 'consumed') {
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

  private async recordFailure(
    meta: BoardDraftMeta,
    error: BoardToolError,
  ): Promise<BoardToolError> {
    meta.validationFailures += 1
    meta.updatedAt = new Date(this.now()).toISOString()
    await this.writeMeta(meta)
    if (meta.validationFailures >= BOARD_REPAIR_LIMIT + 1) {
      return boardToolError(
        'repair_budget_exhausted',
        '同一草稿连续校验失败已达上限，请停止重试并向用户说明问题、换方案',
      )
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
    await writeFile(this.metaPath(meta.buildId), JSON.stringify(meta), {
      encoding: 'utf8',
      mode: 0o600,
    })
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
