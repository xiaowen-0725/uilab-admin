/**
 * Presentational empty-state bind UI for workspace Document content source.
 * All flags/actions from source; does not call picker APIs itself.
 */

import { Button } from '@/components/ui/button'
import type { WorkspaceDocumentRuntimeMode } from '../application/workspace-document-source'

export type WorkspaceDocumentEmptyExtraProps = {
  runtimeMode: WorkspaceDocumentRuntimeMode
  workspaceHint: string | null
  localFolderBound: boolean
  /** Whether Chromium directory picker is available (from source, not adapter import). */
  pickerSupported: boolean
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
  pickerSupported,
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

  const boundHint = workspaceHint ? `：${workspaceHint}` : '本地文件夹'
  const unboundHint = pickerSupported
    ? '可选：绑定本机文件夹，用浏览器只读预览真实文件（非 Electron 桌面宿主）。'
    : '当前浏览器不支持本地文件夹选择；Fake 路径使用内置演示文档。'

  return (
    <div className='flex flex-col items-start gap-2'>
      {localFolderBound ? (
        <>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            已绑定{boundHint}。打开对话中的文件路径将从该文件夹读取。
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
            {unboundHint}
          </p>
          {pickerSupported ? (
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
