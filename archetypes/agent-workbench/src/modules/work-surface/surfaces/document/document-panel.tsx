import { useEffect, useState, type ReactNode } from 'react'
import type {
  DocumentBinaryReadResult,
  DocumentContentPort,
  DocumentReadFailureReason,
  DocumentTextReadResult,
} from '../../ports/document-content-port'
import {
  codeLanguageFor,
  isBinaryDocumentFamily,
  mimeForResourceKey,
  resolveDocumentFormat,
  type DocumentFormatFamily,
} from './format-router'
import { maxBytesForFamily, normalizeWorkspaceResourceKey } from './path-utils'
import { CodeRenderer } from './renderers/code-renderer'
import { MarkdownRenderer } from './renderers/markdown-renderer'
import { TextRenderer } from './renderers/text-renderer'

export type DocumentViewState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unsupported'
  | 'too-large'
  | 'not-found'
  | 'permission-denied'
  | 'read-failed'
  | 'render-failed'

const STATE_COPY: Record<
  Exclude<DocumentViewState, 'ready' | 'loading' | 'empty'>,
  string
> = {
  unsupported: '暂不支持预览此格式。后续可提供下载或外开。',
  'too-large': '文件过大，无法在工作区内完整预览。',
  'not-found': '找不到该文件。路径可能已变更或不在当前工作区。',
  'permission-denied': '没有权限读取该文件。',
  'read-failed': '无法读取该文件。',
  'render-failed': '文档渲染失败。可尝试关闭后重新打开。',
}

const PORT_FAILURE_STATE: Record<
  DocumentReadFailureReason,
  Exclude<DocumentViewState, 'loading' | 'ready' | 'empty' | 'unsupported'>
> = {
  'not-found': 'not-found',
  'permission-denied': 'permission-denied',
  'too-large': 'too-large',
  'read-failed': 'read-failed',
}

/** Map Port failure reason → panel state (IO vs render stay separate). */
export function mapPortFailureToViewState(
  reason: DocumentReadFailureReason,
): Exclude<DocumentViewState, 'loading' | 'ready' | 'empty' | 'unsupported'> {
  return PORT_FAILURE_STATE[reason] ?? 'read-failed'
}

function statusMessage(
  state: DocumentViewState,
  detail?: string | null,
): string {
  if (state === 'loading') return '正在加载文档…'
  if (state === 'empty') return '文件为空。'
  if (state === 'ready') return ''
  if (detail && detail.trim()) return detail.trim()
  return STATE_COPY[state]
}

async function loadHeavyRenderer(
  fmt: DocumentFormatFamily,
  bytes: Uint8Array,
  mime: string,
  resourceKey: string,
  onRenderFailed: () => void,
): Promise<ReactNode> {
  if (fmt === 'image') {
    const { loadImageRenderer } = await import('./renderers/heavy-lazy')
    const ImageRenderer = await loadImageRenderer()
    return (
      <ImageRenderer
        bytes={bytes}
        mimeType={mime || 'image/png'}
        resourceKey={resourceKey}
      />
    )
  }
  if (fmt === 'pdf') {
    const { loadPdfRenderer } = await import('./renderers/heavy-lazy')
    const PdfRenderer = await loadPdfRenderer()
    return <PdfRenderer bytes={bytes} resourceKey={resourceKey} />
  }
  if (fmt === 'docx') {
    const { loadDocxRenderer } = await import('./renderers/heavy-lazy')
    const DocxRenderer = await loadDocxRenderer()
    return (
      <DocxRenderer
        bytes={bytes}
        resourceKey={resourceKey}
        onFailed={onRenderFailed}
      />
    )
  }
  if (fmt === 'xlsx') {
    const { loadXlsxRenderer } = await import('./renderers/heavy-lazy')
    const XlsxRenderer = await loadXlsxRenderer()
    return (
      <XlsxRenderer
        bytes={bytes}
        resourceKey={resourceKey}
        onFailed={onRenderFailed}
      />
    )
  }
  return null
}

export interface DocumentPanelProps {
  resourceKey: string
  title: string
  content: DocumentContentPort
  /** Optional workspace root label from sidecar /workspace/info */
  workspaceHint?: string | null
}

/**
 * Document Surface body — loads via Port, routes by format, read-only preview.
 * Heavy families use dynamic import (A7).
 */
export function DocumentPanel({
  resourceKey,
  title,
  content,
  workspaceHint,
}: DocumentPanelProps) {
  const [state, setState] = useState<DocumentViewState>('loading')
  const [detail, setDetail] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [family, setFamily] = useState<DocumentFormatFamily>('unsupported')
  const [heavyNode, setHeavyNode] = useState<ReactNode>(null)

  useEffect(() => {
    let cancelled = false
    const key = normalizeWorkspaceResourceKey(resourceKey)

    function failPort(
      reason: DocumentReadFailureReason,
      message?: string | null,
    ) {
      if (cancelled) return
      setDetail(message ?? null)
      setState(mapPortFailureToViewState(reason))
    }

    function failReadThrown() {
      if (cancelled) return
      setState('read-failed')
      setDetail('无法读取该文件。')
    }

    async function readPortText(
      pathKey: string,
    ): Promise<DocumentTextReadResult | null> {
      try {
        return await content.readText(pathKey)
      } catch {
        failReadThrown()
        return null
      }
    }

    async function readPortBinary(
      pathKey: string,
    ): Promise<DocumentBinaryReadResult | null> {
      if (!content.readBinary) {
        if (!cancelled) setState('unsupported')
        return null
      }
      try {
        return await content.readBinary(pathKey)
      } catch {
        failReadThrown()
        return null
      }
    }

    async function load() {
      setState('loading')
      setDetail(null)
      setText('')
      setHeavyNode(null)

      if (!key) {
        if (!cancelled) {
          setState('not-found')
          setDetail('无效的工作区路径')
        }
        return
      }

      const fmt = resolveDocumentFormat(key)
      if (!cancelled) setFamily(fmt)

      if (fmt === 'unsupported') {
        if (!cancelled) setState('unsupported')
        return
      }

      if (isBinaryDocumentFamily(fmt)) {
        const result = await readPortBinary(key)
        if (cancelled || result == null) return
        if (!result.ok) {
          failPort(result.reason, result.message)
          return
        }
        if (result.byteLength === 0) {
          setState('empty')
          return
        }
        const max = maxBytesForFamily(fmt)
        if (result.byteLength > max) {
          setState('too-large')
          setDetail(`文件过大（上限 ${max} 字节）`)
          return
        }
        setState('ready')
        try {
          const mime = mimeForResourceKey(key) ?? result.mimeType ?? ''
          const node = await loadHeavyRenderer(
            fmt,
            result.bytes,
            mime,
            key,
            () => {
              if (!cancelled) setState('render-failed')
            },
          )
          if (!cancelled) setHeavyNode(node)
        } catch {
          if (!cancelled) setState('render-failed')
        }
        return
      }

      const result = await readPortText(key)
      if (cancelled || result == null) return
      if (!result.ok) {
        failPort(result.reason, result.message)
        return
      }
      if (result.text.length === 0) {
        setText('')
        setState('empty')
        return
      }
      setText(result.text)
      setState('ready')
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [content, resourceKey])

  const showStateMessage = state !== 'ready'
  const readyBinary = state === 'ready' && isBinaryDocumentFamily(family)

  return (
    <div
      className='flex h-full min-h-0 flex-col gap-2'
      data-testid='work-surface-document'
      data-resource-key={resourceKey}
      data-state={state}
      data-format={family}
      data-title={title}
    >
      <header className='flex shrink-0 flex-col gap-0.5 border-b border-border/60 pb-2'>
        <div className='flex items-baseline justify-between gap-2'>
          <h2 className='truncate text-sm font-medium text-foreground'>
            {title}
          </h2>
          <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
            {family === 'unsupported' ? '未知格式' : family}
          </span>
        </div>
        {workspaceHint ? (
          <p
            className='truncate font-mono text-[11px] text-muted-foreground'
            data-testid='document-workspace-hint'
            title={workspaceHint}
          >
            工作区：{workspaceHint}
          </p>
        ) : null}
      </header>

      {showStateMessage ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
          {...(state !== 'loading' && state !== 'empty'
            ? { 'data-state': state }
            : {})}
        >
          {statusMessage(state, detail)}
        </p>
      ) : null}

      {state === 'ready' && family === 'text' ? (
        <TextRenderer text={text} resourceKey={resourceKey} />
      ) : null}
      {state === 'ready' && family === 'markdown' ? (
        <MarkdownRenderer source={text} resourceKey={resourceKey} />
      ) : null}
      {state === 'ready' && family === 'code' ? (
        <CodeRenderer
          code={text}
          language={codeLanguageFor(resourceKey)}
          resourceKey={resourceKey}
        />
      ) : null}
      {readyBinary ? heavyNode : null}
    </div>
  )
}
