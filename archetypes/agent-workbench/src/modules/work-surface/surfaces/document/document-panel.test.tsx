import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { createMemoryDocumentContent } from '../../adapters/memory-document-content'
import { DocumentPanel } from './document-panel'

describe('DocumentPanel', () => {
  it('renders markdown fixture as ready markdown', async () => {
    const content = createMemoryDocumentContent()
    await render(
      <DocumentPanel
        resourceKey='fixture/notes/workflow-result.md'
        title='workflow-result.md'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('ready')
    await expect
      .element(page.getByTestId('work-surface-document'))
      .toHaveAttribute('data-format', 'markdown')
    await expect
      .element(page.getByTestId('document-renderer-markdown'))
      .toBeInTheDocument()
    await expect
      .element(page.getByTestId('document-renderer-markdown'))
      .toHaveTextContent('Checklist')
  })

  it('renders code fixture', async () => {
    const content = createMemoryDocumentContent()
    await render(
      <DocumentPanel
        resourceKey='demo/hello.py'
        title='hello.py'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('ready')
    await expect
      .element(page.getByTestId('work-surface-document'))
      .toHaveAttribute('data-format', 'code')
    await expect
      .element(page.getByTestId('document-renderer-code'))
      .toHaveTextContent('greet')
  })

  it('renders plain text', async () => {
    const content = createMemoryDocumentContent()
    await render(
      <DocumentPanel
        resourceKey='fixture/notes/plan.txt'
        title='plan.txt'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('ready')
    await expect
      .element(page.getByTestId('document-renderer-text'))
      .toHaveTextContent('读取 plan')
  })

  it('shows empty / not-found / unsupported / too-large states', async () => {
    const content = createMemoryDocumentContent({
      files: {
        'demo/empty.txt': '',
        'demo/huge.txt': 'x'.repeat(100),
      },
      maxBytes: 50,
    })

    const { rerender } = await render(
      <DocumentPanel
        resourceKey='demo/empty.txt'
        title='empty'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('empty')

    await rerender(
      <DocumentPanel
        resourceKey='missing/file.md'
        title='missing'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('not-found')
    await expect
      .element(page.getByTestId('document-state-message'))
      .toHaveTextContent('找不到')

    await rerender(
      <DocumentPanel
        resourceKey='scan.pdf'
        title='scan.pdf'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('unsupported')

    await rerender(
      <DocumentPanel
        resourceKey='demo/huge.txt'
        title='huge'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('too-large')
  })

  it('rejects path escape as not-found', async () => {
    const content = createMemoryDocumentContent()
    await render(
      <DocumentPanel
        resourceKey='../etc/passwd'
        title='bad'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('not-found')
  })
})
