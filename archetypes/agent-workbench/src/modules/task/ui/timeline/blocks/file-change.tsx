import { isInteractiveArtifactKind } from '../../../model/interactive-artifact'
import type { DeliverableRef, TimelineItemMeta } from '../../../projection/types'
import { FileChangeSummaryCard } from '../../markdown/file-change-summary-card'
import { DeliverableCard } from './deliverables'
import type { TimelineBlockProps } from '../timeline-shared'

export function FileChangeBlock({ item, onOpenFileRef }: TimelineBlockProps) {
  const meta: TimelineItemMeta | undefined = item.meta
  if (isInteractiveArtifactKind(meta?.kind) && meta?.id) {
    const ref: DeliverableRef = {
      id: meta.id,
      title: item.title ?? meta.title,
      kind: meta.kind,
      changeKind: meta.changeKind,
      source: 'artifact',
    }
    return (
      <div data-kind={item.category} data-category={item.category}>
        <DeliverableCard item={ref} onOpenFileRef={onOpenFileRef} />
      </div>
    )
  }
  const path = meta?.path ?? item.title ?? 'file'
  const additions = meta?.additions
  const deletions = meta?.deletions
  const diffLines = meta?.diffLines
  const hasDiff = Boolean(diffLines && diffLines.length > 0)

  const previewLines =
    hasDiff && diffLines
      ? diffLines.map((l) =>
          `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${l.text}`,
        )
      : item.body
        ? item.body.split('\n')
        : undefined

  const base = path.split('/').pop() || path

  return (
    <div data-kind={item.category} data-category={item.category}>
      <FileChangeSummaryCard
        path={path}
        additions={additions}
        deletions={deletions}
        changeKind={meta?.changeKind}
        previewLines={previewLines}
        testId={`timeline-item-${item.id}`}
        onOpen={
          onOpenFileRef
            ? (p) =>
                onOpenFileRef({
                  path: p,
                  label: base,
                })
            : undefined
        }
      />
    </div>
  )
}
