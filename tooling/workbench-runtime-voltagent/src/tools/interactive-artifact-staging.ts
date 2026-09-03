/**
 * Disk staging for Interactive Artifact drafts.
 * Layout: {stagingRoot}/{draftId}/meta.json + chunks/{seq} + assembled
 * Namespace is independent of board-staging.
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
  INTERACTIVE_ARTIFACT_MAX_BYTES,
  INTERACTIVE_STAGING_TTL_MS,
  assertNoInteractiveHtmlLeak,
  interactiveToolError,
  isInteractiveToolError,
  type InteractiveDraftMeta,
  type InteractiveToolError,
} from './interactive-artifact-types.js'

export type InteractiveStagingClock = () => number

export type CreateInteractiveArtifactStagingInput = {
  root: string
  now?: InteractiveStagingClock
  ttlMs?: number
}

type DraftRef = {
  artifactId: string
  draftId: string
}

type AppendOk = { received: number; nextSeq: number }
type FinishOk = { artifactId: string; hash: string; bytes: number; title: string }
type ReadyContent = {
  content: string
  hash: string
  bytes: number
  title: string
  artifactId: string
}

const PRIVATE_FILE = { encoding: 'utf8' as const, mode: 0o600 }

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export class InteractiveArtifactStaging {
  readonly root: string
  private readonly now: InteractiveStagingClock
  private readonly ttlMs: number
  private serial: Promise<unknown> = Promise.resolve()

  constructor(input: CreateInteractiveArtifactStagingInput) {
    this.root = path.resolve(input.root)
    this.now = input.now ?? Date.now
    this.ttlMs = input.ttlMs ?? INTERACTIVE_STAGING_TTL_MS
  }

  async begin(input: {
    title?: string
    artifactId?: string
  }): Promise<{ artifactId: string; draftId: string }> {
    return this.withSerial(async () => {
      await this.sweepExpired()
      const artifactId = input.artifactId?.trim() || newId('ia')
      const draftId = newId('d')
      await this.writeMeta(
        this.emptyMeta({
          draftId,
          artifactId,
          title: input.title?.trim() ?? '',
        }),
      )
      return { artifactId, draftId }
    })
  }

  async append(
    input: DraftRef & { seq: number; chunk: string },
  ): Promise<AppendOk | InteractiveToolError> {
    return this.withSerial(async () => {
      const draft = await this.requireDraft(input)
      if (isInteractiveToolError(draft)) return draft
      if (draft.status !== 'open') {
        return interactiveToolError('build_not_ready', '该草稿已结束，不能再追加')
      }
      if (!Number.isInteger(input.seq) || input.seq < 1) {
        return interactiveToolError('validation_failed', 'seq 必须从 1 起的正整数')
      }

      const chunkHash = hashText(input.chunk)
      const existing = draft.received[String(input.seq)]
      if (existing) {
        if (existing === chunkHash) {
          return { received: input.seq, nextSeq: draft.nextSeq }
        }
        return interactiveToolError(
          'validation_failed',
          `seq ${input.seq} 已写入且内容不同，重复 seq 仅在同内容时幂等`,
        )
      }
      if (input.seq !== draft.nextSeq) {
        return interactiveToolError(
          'validation_failed',
          `乱序 seq：缺第 ${draft.nextSeq} 段，当前收到 ${input.seq}`,
        )
      }

      await mkdir(this.chunkDir(input.draftId), { recursive: true })
      await writeFile(
        this.chunkPath(input.draftId, input.seq),
        input.chunk,
        PRIVATE_FILE,
      )
      draft.received[String(input.seq)] = chunkHash
      draft.nextSeq = input.seq + 1
      this.touch(draft)
      await this.writeMeta(draft)
      return { received: input.seq, nextSeq: draft.nextSeq }
    })
  }

  async finish(input: DraftRef): Promise<FinishOk | InteractiveToolError> {
    return this.withSerial(async () => {
      const draft = await this.requireDraft(input)
      if (isInteractiveToolError(draft)) return draft
      if (draft.status === 'consumed') {
        return interactiveToolError('build_not_ready', '该草稿已被拉取，不能再 finish')
      }
      if (draft.nextSeq <= 1) {
        return interactiveToolError(
          'build_not_ready',
          '还没有追加任何分片，无法 finish',
        )
      }

      const content = await this.assemble(input.draftId, draft)
      const bytes = Buffer.byteLength(content, 'utf8')
      if (bytes > INTERACTIVE_ARTIFACT_MAX_BYTES) {
        return interactiveToolError(
          'validation_failed',
          `交互产物超过 ${INTERACTIVE_ARTIFACT_MAX_BYTES} 字节上限`,
        )
      }

      const contentHash = hashText(content)
      await writeFile(this.assembledPath(input.draftId), content, PRIVATE_FILE)
      draft.status = 'ready'
      draft.contentHash = contentHash
      draft.bytes = bytes
      this.touch(draft)
      await this.writeMeta(draft)
      const result = {
        artifactId: draft.artifactId,
        hash: contentHash,
        bytes,
        title: draft.title,
      }
      assertNoInteractiveHtmlLeak(result)
      return result
    })
  }

  async readReadyContent(
    draftId: string,
  ): Promise<ReadyContent | InteractiveToolError> {
    return this.withSerial(async () => {
      const loaded = await this.loadMeta(draftId)
      if (!loaded) return interactiveToolError('unknown_build', '未知的草稿')
      if (this.isExpired(loaded)) {
        await rm(this.draftDir(draftId), { recursive: true, force: true })
        return interactiveToolError(
          'unknown_build',
          '草稿已过期或不存在，请重新 begin / finish',
        )
      }
      if (loaded.status === 'consumed') {
        return interactiveToolError(
          'build_not_ready',
          '该草稿已被拉取，不可二次读取',
        )
      }
      if (loaded.status !== 'ready' || !loaded.contentHash || loaded.bytes == null) {
        return interactiveToolError(
          'build_not_ready',
          '草稿尚未 finish，不能拉取内容',
        )
      }
      const content = await readFile(this.assembledPath(draftId), 'utf8')
      loaded.status = 'consumed'
      this.touch(loaded)
      await this.writeMeta(loaded)
      await rm(this.assembledPath(draftId), { force: true })
      return {
        content,
        hash: loaded.contentHash,
        bytes: loaded.bytes,
        title: loaded.title,
        artifactId: loaded.artifactId,
      }
    })
  }

  private async sweepExpired(): Promise<void> {
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
    draftId: string
    artifactId: string
    title: string
  }): InteractiveDraftMeta {
    const stamp = new Date(this.now()).toISOString()
    return {
      kind: 'interactive',
      draftId: input.draftId,
      artifactId: input.artifactId,
      title: input.title,
      nextSeq: 1,
      received: {},
      status: 'open',
      createdAt: stamp,
      updatedAt: stamp,
    }
  }

  private async requireDraft(
    ref: DraftRef,
  ): Promise<InteractiveDraftMeta | InteractiveToolError> {
    const loaded = await this.loadMeta(ref.draftId)
    if (!loaded) {
      return interactiveToolError('unknown_build', '未知的 draftId，请先调用 begin')
    }
    if (loaded.artifactId !== ref.artifactId) {
      return interactiveToolError('unknown_build', 'artifactId 与 draftId 不匹配')
    }
    if (this.isExpired(loaded)) {
      await rm(this.draftDir(ref.draftId), { recursive: true, force: true })
      return interactiveToolError(
        'unknown_build',
        '草稿已过期或不存在，请重新 begin / finish',
      )
    }
    return loaded
  }

  private isExpired(meta: InteractiveDraftMeta): boolean {
    const updated = Date.parse(meta.updatedAt)
    return !Number.isFinite(updated) || updated < this.now() - this.ttlMs
  }

  private touch(meta: InteractiveDraftMeta): void {
    meta.updatedAt = new Date(this.now()).toISOString()
  }

  private async assemble(
    draftId: string,
    meta: InteractiveDraftMeta,
  ): Promise<string> {
    const parts: string[] = []
    for (let seq = 1; seq < meta.nextSeq; seq += 1) {
      parts.push(await readFile(this.chunkPath(draftId, seq), 'utf8'))
    }
    return parts.join('')
  }

  private async loadMeta(draftId: string): Promise<InteractiveDraftMeta | null> {
    try {
      const raw = await readFile(this.metaPath(draftId), 'utf8')
      const parsed = JSON.parse(raw) as InteractiveDraftMeta
      if (!parsed || parsed.draftId !== draftId || parsed.kind !== 'interactive') {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  private async writeMeta(meta: InteractiveDraftMeta): Promise<void> {
    const dir = this.draftDir(meta.draftId)
    await mkdir(dir, { recursive: true })
    await writeFile(this.metaPath(meta.draftId), JSON.stringify(meta), PRIVATE_FILE)
  }

  private draftDir(draftId: string): string {
    return path.join(this.root, draftId)
  }

  private metaPath(draftId: string): string {
    return path.join(this.draftDir(draftId), 'meta.json')
  }

  private chunkDir(draftId: string): string {
    return path.join(this.draftDir(draftId), 'chunks')
  }

  private chunkPath(draftId: string, seq: number): string {
    return path.join(this.chunkDir(draftId), String(seq))
  }

  private assembledPath(draftId: string): string {
    return path.join(this.draftDir(draftId), 'assembled')
  }

  private async withSerial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.serial.then(work, work)
    this.serial = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
