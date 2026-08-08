import type { SurfaceDefinition } from '../../model/types'

/**
 * Test-only Surface — proves Host renders via Registry without Document/Browser.
 * Composition registers this in product/dev; Document/Browser arrive in later tickets.
 */
export function createTestSurfaceDefinition(): SurfaceDefinition {
  return {
    kind: 'test',
    displayName: '测试面',
    match: (resource) => resource.resourceKey.startsWith('test:'),
    render: (props) => (
      <div
        className='space-y-2 text-sm text-foreground'
        data-testid='work-surface-test-body'
        data-tab-id={props.tabId}
        data-resource-key={props.resourceKey}
      >
        <p className='font-medium'>测试 Surface</p>
        <p className='text-muted-foreground'>
          标题：{props.title}
        </p>
        <p className='font-mono text-xs text-muted-foreground'>
          resourceKey={props.resourceKey}
        </p>
        <p className='font-mono text-xs text-muted-foreground'>
          taskId={props.taskId}
        </p>
      </div>
    ),
  }
}
