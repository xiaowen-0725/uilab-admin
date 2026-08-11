/**
 * Work toolbar chrome when a local folder is bound and tabs hide emptyExtra.
 * Module-owned bind clear control — Composition only mounts this node.
 */

import { Button } from '@/components/ui/button'

export type WorkspaceDocumentToolbarTrailingProps = {
  localFolderBound: boolean
  onClearLocalFolder: () => void
}

export function WorkspaceDocumentToolbarTrailing({
  localFolderBound,
  onClearLocalFolder,
}: WorkspaceDocumentToolbarTrailingProps) {
  if (!localFolderBound) return null
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='h-auto px-2 py-1 text-xs text-muted-foreground'
      data-testid='clear-local-workspace-folder-toolbar'
      onClick={onClearLocalFolder}
    >
      恢复演示文档
    </Button>
  )
}
