/**
 * Timeline / stream Markdown — Streamdown + Codex file-reference chips.
 * @see docs/research/codex-content-area-diff-and-acceptance.md
 */

import type { ComponentPropsWithoutRef } from 'react'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { Streamdown, type PluginConfig } from 'streamdown'
import { cn } from '@/lib/utils'
import {
  FileReferenceChip,
  isFilePathToken,
  parseFileRefTarget,
} from './file-reference-chip'

import 'streamdown/styles.css'

const streamPlugins: PluginConfig = {
  cjk,
  code: code as PluginConfig['code'],
}

export type SimpleMarkdownProps = {
  source: string
  className?: string
  isAnimating?: boolean
  onOpenFileRef?: (info: {
    path?: string
    line?: number
    label: string
  }) => void
}

/**
 * Harden-safe: turn file links into custom HTML tags Streamdown allows.
 * - `[label](wb-file:path:38)` → `<file-ref path="..." line="38">label</file-ref>`
 * - `` `path/to/file.ext` `` → same (path-like tokens only)
 */
export function preprocessFileReferences(source: string): string {
  let s = source
  s = s.replace(
    /\[([^\]]+)\]\((?:wb-file:|file:\/\/)([^)\s]+)\)/g,
    (_m, label: string, target: string) => {
      const t = parseFileRefTarget(target, label)
      const pathAttr = t.path ? ` path="${escapeAttr(t.path)}"` : ''
      const lineAttr = t.line != null ? ` line="${t.line}"` : ''
      return `<file-ref${pathAttr}${lineAttr}>${escapeText(label)}</file-ref>`
    },
  )
  s = s.replace(/`([^`\n]+)`/g, (full, inner: string) => {
    if (!isFilePathToken(inner)) return full
    return `<file-ref path="${escapeAttr(inner)}">${escapeText(inner.split('/').pop() || inner)}</file-ref>`
  })
  return s
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildComponents(onOpenFileRef?: SimpleMarkdownProps['onOpenFileRef']) {
  return {
    // Custom tag from preprocessFileReferences
    'file-ref': ({
      path,
      line,
      children,
    }: {
      path?: string
      line?: string
      children?: unknown
    }) => {
      const label = extractText(children) || path || 'file'
      return (
        <FileReferenceChip
          label={label}
          path={path}
          line={line ? Number(line) : undefined}
          onOpen={onOpenFileRef}
        />
      )
    },
    a: ({
      href,
      children,
      ...rest
    }: ComponentPropsWithoutRef<'a'>) => {
      const childText = extractText(children)
      const isFile =
        Boolean(href && /^(wb-file:|file:|\/|\.\/)/i.test(href)) ||
        /\(line\s*\d+\)/i.test(childText)
      if (isFile) {
        const t = parseFileRefTarget(href, childText)
        return (
          <FileReferenceChip
            label={t.label}
            path={t.path}
            line={t.line}
            onOpen={onOpenFileRef}
          />
        )
      }
      const httpUrl =
        href && /^https?:\/\//i.test(href) ? href : null
      if (httpUrl && onOpenFileRef) {
        return (
          <a
            {...rest}
            href={httpUrl}
            data-testid='timeline-url-link'
            className='font-medium underline-offset-2 hover:underline'
            style={{ color: 'color(srgb 0.511373 0.712157 0.900392)' }}
            onClick={(event) => {
              event.preventDefault()
              onOpenFileRef({
                path: httpUrl,
                label: childText || httpUrl,
              })
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a
          {...rest}
          href={href}
          className='font-medium underline-offset-2 hover:underline'
          style={{ color: 'color(srgb 0.511373 0.712157 0.900392)' }}
          target='_blank'
          rel='noreferrer'
        >
          {children}
        </a>
      )
    },
    code: ({
      className,
      children,
      ...rest
    }: ComponentPropsWithoutRef<'code'>) => {
      const text = extractText(children).trim()
      const isBlock = Boolean(className?.includes('language-'))
      if (!isBlock && isFilePathToken(text)) {
        return (
          <FileReferenceChip
            label={text.split('/').pop() || text}
            path={text}
            onOpen={onOpenFileRef}
          />
        )
      }
      return (
        <code
          {...rest}
          className={cn(
            !isBlock &&
              'rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm font-[445]',
            className,
          )}
        >
          {children}
        </code>
      )
    },
  }
}

function extractText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const p = node as { props?: { children?: unknown } }
    return extractText(p.props?.children)
  }
  return ''
}

export function SimpleMarkdown({
  source,
  className,
  isAnimating = false,
  onOpenFileRef,
}: SimpleMarkdownProps) {
  const components = buildComponents(onOpenFileRef)
  const prepared = preprocessFileReferences(source)

  return (
    <div
      className={cn(
        'stream-markdown tl-prose text-foreground',
        /* Headings stay near body size; rhythm matches grok-app chat-md. */
        '[&_h1]:text-[1.25em] [&_h2]:text-[1.12em] [&_h3]:text-[1.05em]',
        '[&_:is(h1,h2,h3)]:mb-[0.5em] [&_:is(h1,h2,h3)]:mt-[1.15em]',
        '[&_:is(h1,h2,h3)]:font-semibold [&_:is(h1,h2,h3)]:leading-[1.35]',
        '[&_:is(h1,h2,h3)]:text-balance',
        '[&_p]:mt-0 [&_p]:mb-[0.85em] [&_p]:whitespace-pre-wrap',
        '[&_blockquote]:my-[0.85em] [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_ul]:my-[0.85em] [&_ul]:list-disc [&_ul]:pl-[1.35em]',
        '[&_ol]:my-[0.85em] [&_ol]:list-decimal [&_ol]:pl-[1.35em]',
        '[&_li]:my-[0.28em]',
        '[&_pre]:my-[0.75em] [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:border [&_pre]:border-border/40 [&_pre]:bg-muted/60',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        className,
      )}
      data-slot='simple-markdown'
      data-testid='simple-markdown'
    >
      <Streamdown
        className='size-full'
        plugins={streamPlugins}
        components={components as never}
        allowedTags={{ 'file-ref': ['path', 'line'] }}
        isAnimating={isAnimating}
        mode={isAnimating ? 'streaming' : 'static'}
        controls={false}
        lineNumbers={false}
        parseIncompleteMarkdown
      >
        {prepared}
      </Streamdown>
    </div>
  )
}
