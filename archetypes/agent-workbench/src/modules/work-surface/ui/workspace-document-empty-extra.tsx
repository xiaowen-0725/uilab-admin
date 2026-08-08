/**
 * Presentational empty-state bind UI for workspace Document content source.
 * Data/actions from WorkspaceDocumentSource; Host only hosts the node.
 */

import { Button } from '@/components/ui/button'
import {
  isFsAccessDirectoryPickerSupported,
  type WorkspaceDocumentRuntimeMode,
} from '../application/workspace-document-source'

export type WorkspaceDocumentEmptyExtraProps = {
  runtimeMode: WorkspaceDocumentRuntimeMode
  workspaceHint: string | null
  localFolderBound: boolean
  bindNotice: string | null
  onPickLocalFolder: () => void | Promise<void>
  onClearLocalFolder: () => void
}

/**
 * Chinese empty-state: bind local folder / restore demo docs / voltagent honesty.
 */
export function WorkspaceDocumentEmptyExtra({
  runtimeMode,
  workspaceHint,
  localFolderBound,
  bindNotice,
  onPickLocalFolder,
  onClearLocalFolder,
}: WorkspaceDocumentEmptyExtraProps) {
  if (runtimeMode === 'voltagent') {
    return (
      <p className='text-xs leading-relaxed text-muted-foreground'>
        文档内容来自侧车工作区
        {workspaceHint ? `（${workspaceHint}）` : ''}。
      </p>
    )
  }

  const canPick = isFsAccessDirectoryPickerSupported()

  return (
    <div className='flex flex-col items-start gap-2'>
      {localFolderBound ? (
        <>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            已绑定{workspaceHint ? `：${workspaceHint}` : '本地文件夹'}。
            打开对话中的文件路径将从该文件夹读取。
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            data-testid='clear-local-workspace-folder'
            onClick={onClearLocalFolder}
          >
            恢复演示文档
          </Button>
        </>
      ) : (
        <>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            {canPick
              ? '可选：绑定本机文件夹，用浏览器只读预览真实文件（非 Electron 桌面宿主）。'
              : '当前浏览器不支持本地文件夹选择；Fake 路径使用内置演示文档。'}
          </p>
          {canPick ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              data-testid='pick-local-workspace-folder'
              onClick={() => void onPickLocalFolder()}
            >
              绑定本地文件夹
            </Button>
          ) : null}
        </>
      )}
      {bindNotice ? (
        <p
          className='text-xs text-destructive'
          data-testid='local-workspace-bind-notice'
        >
          {bindNotice}
        </p>
      ) : null}
    </div>
  )
}
