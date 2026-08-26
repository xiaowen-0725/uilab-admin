import type { TimelineItemMeta } from '../../../projection/types'
import { FileChangeSummaryCard } from '../../markdown/file-change-summary-card'
import type { TimelineBlockProps } from '../timeline-shared'

export function FileChangeBlock({ item, onOpenFileRef }: TimelineBlockProps) {
  const meta: TimelineItemMeta | undefined = item.meta
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
