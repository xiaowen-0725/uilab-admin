import { useEffect, useState, type ReactNode } from 'react'
import type { DocumentContentPort } from '../../ports/document-content-port'
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

      try {
        if (isBinaryDocumentFamily(fmt)) {
          if (!content.readBinary) {
            if (!cancelled) setState('unsupported')
            return
          }
          const result = await content.readBinary(key)
          if (cancelled) return
          if (!result.ok) {
            setDetail(result.message ?? null)
            if (result.reason === 'not-found') setState('not-found')
            else if (result.reason === 'permission-denied')
              setState('permission-denied')
            else if (result.reason === 'too-large') setState('too-large')
            else if (result.reason === 'read-failed') setState('read-failed')
            else setState('render-failed')
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
          // Lazy load heavy renderer modules (A7 — dynamic import)
          const mime = mimeForResourceKey(key) ?? result.mimeType ?? ''
          if (fmt === 'image') {
            const { loadImageRenderer } = await import('./renderers/heavy-lazy')
            const ImageRenderer = await loadImageRenderer()
            if (!cancelled) {
              setHeavyNode(
                <ImageRenderer
                  bytes={result.bytes}
                  mimeType={mime || 'image/png'}
                  resourceKey={key}
                />,
              )
            }
          } else if (fmt === 'pdf') {
            const { loadPdfRenderer } = await import('./renderers/heavy-lazy')
            const PdfRenderer = await loadPdfRenderer()
            if (!cancelled) {
              setHeavyNode(
                <PdfRenderer bytes={result.bytes} resourceKey={key} />,
              )
            }
          } else if (fmt === 'docx') {
            const { loadDocxRenderer } = await import('./renderers/heavy-lazy')
            const DocxRenderer = await loadDocxRenderer()
            if (!cancelled) {
              setHeavyNode(
                <DocxRenderer
                  bytes={result.bytes}
                  resourceKey={key}
                  onFailed={() => {
                    if (!cancelled) setState('render-failed')
                  }}
                />,
              )
            }
          } else if (fmt === 'xlsx') {
            const { loadXlsxRenderer } = await import('./renderers/heavy-lazy')
            const XlsxRenderer = await loadXlsxRenderer()
            if (!cancelled) {
              setHeavyNode(
                <XlsxRenderer
                  bytes={result.bytes}
                  resourceKey={key}
                  onFailed={() => {
                    if (!cancelled) setState('render-failed')
                  }}
                />,
              )
            }
          }
          return
        }

        const result = await content.readText(key)
        if (cancelled) return
        if (!result.ok) {
          setDetail(result.message ?? null)
          if (result.reason === 'not-found') setState('not-found')
          else if (result.reason === 'permission-denied')
            setState('permission-denied')
          else if (result.reason === 'too-large') setState('too-large')
          else if (result.reason === 'read-failed') setState('read-failed')
          else setState('render-failed')
          return
        }
        if (result.text.length === 0) {
          setText('')
          setState('empty')
          return
        }
        setText(result.text)
        setState('ready')
      } catch {
        if (!cancelled) setState('render-failed')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [content, resourceKey])

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

      {state === 'loading' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
        >
          {statusMessage('loading', detail)}
        </p>
      ) : null}

      {state === 'empty' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
        >
          {statusMessage('empty', detail)}
        </p>
      ) : null}

      {state !== 'loading' && state !== 'ready' && state !== 'empty' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
          data-state={state}
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
      {state === 'ready' && isBinaryDocumentFamily(family) ? heavyNode : null}
    </div>
  )
}
