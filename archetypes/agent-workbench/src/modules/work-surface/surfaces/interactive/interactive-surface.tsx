import { useEffect, useMemo, useState } from 'react'
import type { SurfaceDefinition } from '../../model/types'
import { InteractiveIslandFrame, readHostCspNonce } from './interactive-island-frame'
import { buildInteractiveIslandDocument } from './island-document'

export const INTERACTIVE_SURFACE_KIND = 'interactive' as const

export type InteractiveArtifactLookup = {
  get(
    taskId: string,
    artifactId: string,
  ): Promise<{ title: string; html: string } | null>
}

export type CreateInteractiveSurfaceOptions = {
  lookup: InteractiveArtifactLookup
  revision?: number
}

export type InteractiveSurfacePanelProps = {
  taskId: string
  artifactId: string
  title: string
  lookup: InteractiveArtifactLookup
  revision?: number
}

type IslandViewState = 'loading' | 'ready' | 'not-found'

const STATE_COPY: Record<Exclude<IslandViewState, 'ready'>, string> = {
  loading: '正在加载交互产物…',
  'not-found': '找不到这份交互产物。它只属于产生它的任务。',
}

export function InteractiveSurfacePanel({
  taskId,
  artifactId,
  title,
  lookup,
  revision = 0,
}: InteractiveSurfacePanelProps) {
  const [state, setState] = useState<IslandViewState>('loading')
  const [html, setHtml] = useState<string | null>(null)
  const [resolvedTitle, setResolvedTitle] = useState(title)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setHtml(null)
    void lookup.get(taskId, artifactId).then((record) => {
      if (cancelled) return
      if (!record) {
        setState('not-found')
        return
      }
      setResolvedTitle(record.title || title)
      setHtml(record.html)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [artifactId, lookup, revision, taskId, title])

  const srcDoc = useMemo(() => {
    if (!html) return ''
    return buildInteractiveIslandDocument({
      html,
      nonce: readHostCspNonce(),
    })
  }, [html])

  return (
    <div
      className='flex h-full min-h-0 flex-col gap-2'
      data-testid='work-surface-interactive'
      data-artifact-id={artifactId}
      data-state={state}
      data-title={resolvedTitle}
    >
      <header className='flex shrink-0 flex-col gap-0.5 border-b border-border/60 pb-2'>
        <div className='flex items-baseline justify-between gap-2'>
          <h2 className='truncate text-sm font-medium text-foreground'>
            {resolvedTitle}
          </h2>
          <span className='shrink-0 text-[11px] text-muted-foreground'>
            交互产物
          </span>
        </div>
      </header>
      {state !== 'ready' ? (
        <p
          className='text-sm text-muted-foreground'
          data-testid='interactive-surface-state'
        >
          {STATE_COPY[state]}
        </p>
      ) : (
        <InteractiveIslandFrame
          srcDoc={srcDoc}
          title={resolvedTitle}
          assignKey={revision}
          className='min-h-[16rem] w-full flex-1 rounded-md bg-background'
        />
      )}
    </div>
  )
}

/**
 * Interactive Surface definition (kind: interactive).
 * Composition injects a Task-scoped lookup; Host never imports this file.
 */
export function createInteractiveSurfaceDefinition(
  options: CreateInteractiveSurfaceOptions,
): SurfaceDefinition {
  const { lookup, revision = 0 } = options
  return {
    kind: INTERACTIVE_SURFACE_KIND,
    displayName: '交互产物',
    render: (props) => (
      <InteractiveSurfacePanel
        taskId={props.taskId}
        artifactId={props.resourceKey}
        title={props.title}
        lookup={lookup}
        revision={revision}
      />
    ),
  }
}
