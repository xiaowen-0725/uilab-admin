import type { ComponentType, ReactElement, SVGProps } from 'react'
import {
  Bars4Icon as ListTree,
  CommandLineIcon as SquareTerminal,
  CubeTransparentIcon as Boxes,
  DocumentMagnifyingGlassIcon as FileSearch2,
  GlobeAltIcon as Globe,
  PencilSquareIcon as FilePenLine,
} from '@heroicons/react/24/outline'

type ActivityIcon = ComponentType<SVGProps<SVGSVGElement>>

type ActivityIconKind =
  | 'search'
  | 'write'
  | 'read'
  | 'list'
  | 'command'
  | 'other'

interface ActivityIconDefinition {
  Icon: ActivityIcon
  kind: ActivityIconKind
}

export interface ToolActivityIconProps {
  kind?: string
  className?: string
}

function resolveActivityIcon(kind?: string): ActivityIconDefinition {
  const normalizedKind = (kind ?? '').toLowerCase()

  if (/search|web|搜索/.test(normalizedKind)) {
    return { Icon: Globe, kind: 'search' }
  }
  if (/write|edit|patch|写入|编辑/.test(normalizedKind)) {
    return { Icon: FilePenLine, kind: 'write' }
  }
  if (/read|file|读取/.test(normalizedKind)) {
    return { Icon: FileSearch2, kind: 'read' }
  }
  if (/list|tree|目录|列出/.test(normalizedKind)) {
    return { Icon: ListTree, kind: 'list' }
  }
  if (/command|shell|cmd|命令/.test(normalizedKind)) {
    return { Icon: SquareTerminal, kind: 'command' }
  }
  return { Icon: Boxes, kind: 'other' }
}

export function ToolActivityIcon({
  kind,
  className = 'size-3.5 shrink-0 opacity-80',
}: ToolActivityIconProps): ReactElement {
  const { Icon, kind: activityKind } = resolveActivityIcon(kind)

  return (
    <Icon
      className={className}
      data-activity-icon={activityKind}
      aria-hidden
    />
  )
}
