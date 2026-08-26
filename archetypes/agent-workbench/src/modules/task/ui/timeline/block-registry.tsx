import type { ReactElement } from 'react'
import type { TimelineItemCategory } from '../../projection/types'
import { PlanUpdateCard } from './plan-update-card'
import { ApprovalRequestBlock } from './blocks/approval-request'
import { AssistantMessageBlock } from './blocks/assistant-message'
import { CommandBlock } from './blocks/command'
import { ErrorBlock } from './blocks/error'
import { FallbackBlock } from './blocks/fallback'
import { FileChangeBlock } from './blocks/file-change'
import { InputRequestBlock } from './blocks/input-request'
import { ReasoningBlock } from './blocks/reasoning'
import { SourceGroupBlock } from './blocks/source-group'
import { ToolRow } from './blocks/tool-row'
import { TurnTerminalBlock } from './blocks/turn-terminal'
import { UnsupportedEventBlock } from './blocks/unsupported-event'
import { UserMessageBlock } from './blocks/user-message'
import { WarningBlock } from './blocks/warning'
import type { TimelineBlockProps } from './timeline-shared'

export type TimelineBlockComponent = (
  props: TimelineBlockProps,
) => ReactElement | null

function ToolGroupBlock({ item, forceToolCollapsed }: TimelineBlockProps) {
  return <ToolRow item={item} forceCollapsed={forceToolCollapsed} />
}

function PlanUpdateBlock({ item }: TimelineBlockProps) {
  return <PlanUpdateCard item={item} />
}

export const timelineBlockRegistry: Record<
  TimelineItemCategory,
  TimelineBlockComponent
> = {
  'user-message': UserMessageBlock,
  'assistant-message': AssistantMessageBlock,
  'reasoning-section': ReasoningBlock,
  'plan-update': PlanUpdateBlock,
  'tool-group': ToolGroupBlock,
  'command-execution': CommandBlock,
  'file-change': FileChangeBlock,
  artifact: FileChangeBlock,
  'source-group': SourceGroupBlock,
  'approval-request': ApprovalRequestBlock,
  'input-request': InputRequestBlock,
  warning: WarningBlock,
  error: ErrorBlock,
  'turn-terminal': TurnTerminalBlock,
  'unsupported-event': UnsupportedEventBlock,
}

export function TimelineBlock(props: TimelineBlockProps) {
  const Comp =
    timelineBlockRegistry[props.item.category] ?? FallbackBlock
  return <Comp {...props} />
}
