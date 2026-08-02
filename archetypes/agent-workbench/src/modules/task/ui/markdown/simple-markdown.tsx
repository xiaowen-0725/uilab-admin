/**
 * Minimal Markdown → React for capture replay.
 * No extra npm dependency; covers paragraphs, bold, inline/code fences, lists.
 */

import type { ReactNode } from 'react'

export function SimpleMarkdown({
  source,
  className,
}: {
  source: string
  className?: string
}) {
  const blocks = splitBlocks(source)
  return (
    <div
      className={className}
      data-slot='simple-markdown'
      data-testid='simple-markdown'
    >
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; text: string }

function splitBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'ol', items })
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocks.push({ kind: 'ul', items })
      continue
    }
    const para: string[] = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ kind: 'p', text: para.join('\n') })
  }
  return blocks
}

function Block({ block }: { block: Block }) {
  if (block.kind === 'code') {
    return (
      <pre className='my-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-relaxed'>
        <code>{block.text}</code>
      </pre>
    )
  }
  if (block.kind === 'ul' || block.kind === 'ol') {
    const ListTag = block.kind === 'ul' ? 'ul' : 'ol'
    const listClass =
      block.kind === 'ul'
        ? 'my-2 list-disc space-y-1 pl-5 text-sm leading-[22px]'
        : 'my-2 list-decimal space-y-1 pl-5 text-sm leading-[22px]'
    return (
      <ListTag className={listClass}>
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ListTag>
    )
  }
  return (
    <p className='my-2 text-sm leading-[22px] whitespace-pre-wrap'>
      {inline(block.text)}
    </p>
  )
}

/** Bold **x**, inline `code`. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className='font-semibold'>
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      nodes.push(
        <code
          key={key++}
          className='rounded bg-muted px-1 py-0.5 font-mono text-[12px]'
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
