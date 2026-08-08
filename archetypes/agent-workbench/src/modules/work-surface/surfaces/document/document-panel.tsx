import { useEffect, useState } from 'react'
import type { DocumentContentPort } from '../../ports/document-content-port'
import {
  codeLanguageFor,
  resolveDocumentFormat,
  type DocumentFormatFamily,
} from './format-router'
import { normalizeWorkspaceResourceKey } from './path-utils'
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
  | 'render-failed'

export interface DocumentPanelProps {
  resourceKey: string
  title: string
  content: DocumentContentPort
}

const STATE_COPY: Record<
  Exclude<DocumentViewState, 'ready' | 'loading' | 'empty'>,
  string
> = {
  unsupported: '暂不支持预览此格式。后续可提供下载或外开。',
  'too-large': '文件过大，无法在工作区内完整预览。',
  'not-found': '找不到该文件。路径可能已变更或不在当前工作区。',
  'permission-denied': '没有权限读取该文件。',
  'render-failed': '文档渲染失败。可尝试关闭后重新打开。',
}

function statusMessage(state: DocumentViewState): string {
  if (state === 'loading') return '正在加载文档…'
  if (state === 'empty') return '文件为空。'
  if (state === 'ready') return ''
  return STATE_COPY[state]
}

/**
 * Document Surface body — loads via Port, routes by format, read-only preview.
 */
export function DocumentPanel({
  resourceKey,
  title,
  content,
}: DocumentPanelProps) {
  const [state, setState] = useState<DocumentViewState>('loading')
  const [text, setText] = useState('')
  const [family, setFamily] = useState<DocumentFormatFamily>('unsupported')

  useEffect(() => {
    let cancelled = false
    const key = normalizeWorkspaceResourceKey(resourceKey)

    async function load() {
      setState('loading')
      setText('')

      if (!key) {
        if (!cancelled) setState('not-found')
        return
      }

      const fmt = resolveDocumentFormat(key)
      if (!cancelled) setFamily(fmt)

      if (fmt === 'unsupported') {
        if (!cancelled) setState('unsupported')
        return
      }

      try {
        const result = await content.readText(key)
        if (cancelled) return
        if (!result.ok) {
          if (result.reason === 'not-found') setState('not-found')
          else if (result.reason === 'permission-denied')
            setState('permission-denied')
          else if (result.reason === 'too-large') setState('too-large')
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
      <header className='flex shrink-0 items-baseline justify-between gap-2 border-b border-border/60 pb-2'>
        <h2 className='truncate text-sm font-medium text-foreground'>
          {title}
        </h2>
        <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
          {family === 'unsupported' ? '未知格式' : family}
        </span>
      </header>

      {state === 'loading' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
        >
          {statusMessage('loading')}
        </p>
      ) : null}

      {state === 'empty' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
        >
          {statusMessage('empty')}
        </p>
      ) : null}

      {state !== 'loading' &&
      state !== 'ready' &&
      state !== 'empty' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='document-state-message'
          data-state={state}
        >
          {statusMessage(state)}
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
    </div>
  )
}
