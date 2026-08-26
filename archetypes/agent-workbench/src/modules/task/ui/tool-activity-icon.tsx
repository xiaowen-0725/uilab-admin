import type { ReactElement } from 'react'
import {
  ConversationIcon,
  type ConversationIconName,
} from '@/components/icons/conversation-icon'

type ActivityIconKind =
  | 'search'
  | 'write'
  | 'read'
  | 'list'
  | 'command'
  | 'other'

interface ActivityIconDefinition {
  name: ConversationIconName
  kind: ActivityIconKind
}

export interface ToolActivityIconProps {
  kind?: string
  className?: string
}

function resolveActivityIcon(kind?: string): ActivityIconDefinition {
  const normalizedKind = (kind ?? '').toLowerCase()

  if (/search|web|搜索/.test(normalizedKind)) {
    return { name: 'search', kind: 'search' }
  }
  if (/write|edit|patch|写入|编辑/.test(normalizedKind)) {
    return { name: 'edit', kind: 'write' }
  }
  if (/read|file|读取/.test(normalizedKind)) {
    return { name: 'library', kind: 'read' }
  }
  if (/list|tree|\bls\b|目录|列出/.test(normalizedKind)) {
    return { name: 'folder', kind: 'list' }
  }
  if (/command|shell|cmd|命令/.test(normalizedKind)) {
    return { name: 'terminal', kind: 'command' }
  }
  return { name: 'project', kind: 'other' }
}

export function ToolActivityIcon({
  kind,
  className = 'size-4 shrink-0 opacity-80',
}: ToolActivityIconProps): ReactElement {
  const { name, kind: activityKind } = resolveActivityIcon(kind)

  return (
    <ConversationIcon
      name={name}
      className={className}
      data-activity-icon={activityKind}
    />
  )
}
