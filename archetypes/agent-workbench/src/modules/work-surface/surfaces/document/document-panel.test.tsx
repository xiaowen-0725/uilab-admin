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
        resourceKey='archive.xyz'
        title='archive.xyz'
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

  it('renders image / pdf / xlsx / docx fixtures (heavy, lazy)', async () => {
    const content = createMemoryDocumentContent()

    const { rerender } = await render(
      <DocumentPanel
        resourceKey='demo/pixel.png'
        title='pixel.png'
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
      .toHaveAttribute('data-format', 'image')
    await expect
      .element(page.getByTestId('document-renderer-image'))
      .toBeInTheDocument()

    await rerender(
      <DocumentPanel
        resourceKey='demo/hello.pdf'
        title='hello.pdf'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-format'),
      )
      .toBe('pdf')
    await expect
      .element(page.getByTestId('document-renderer-pdf'))
      .toBeInTheDocument()

    await rerender(
      <DocumentPanel
        resourceKey='demo/sheet.xlsx'
        title='sheet.xlsx'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page
          .getByTestId('document-renderer-xlsx')
          .element()
          .getAttribute('data-readonly'),
      )
      .toBe('true')
    await expect
      .element(page.getByTestId('document-renderer-xlsx'))
      .toHaveTextContent('alpha')

    await rerender(
      <DocumentPanel
        resourceKey='demo/letter.docx'
        title='letter.docx'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('document-renderer-docx').element().textContent ?? '',
      )
      .toMatch(/Hello DOCX|Word|加载/)
  })

  it('marks legacy .doc as unsupported', async () => {
    const content = createMemoryDocumentContent({
      binaryFiles: {
        'legacy.doc': new Uint8Array([0, 1, 2]),
      },
    })
    await render(
      <DocumentPanel resourceKey='legacy.doc' title='legacy' content={content} />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('unsupported')
  })

  it('shows port failure message detail when present', async () => {
    const content = {
      async readText() {
        return {
          ok: false as const,
          reason: 'read-failed' as const,
          message: '工作区侧车未连接或网络错误',
        }
      },
      async readBinary() {
        return {
          ok: false as const,
          reason: 'read-failed' as const,
          message: '工作区侧车未连接或网络错误',
        }
      },
    }
    await render(
      <DocumentPanel
        resourceKey='notes/seed.md'
        title='seed.md'
        content={content}
      />,
    )
    await expect
      .poll(() =>
        page.getByTestId('work-surface-document').element().getAttribute('data-state'),
      )
      .toBe('render-failed')
    await expect
      .element(page.getByTestId('document-state-message'))
      .toHaveTextContent('工作区侧车未连接')
  })

  it('renders optional workspace hint in header', async () => {
    const content = createMemoryDocumentContent()
    await render(
      <DocumentPanel
        resourceKey='fixture/notes/plan.txt'
        title='plan.txt'
        content={content}
        workspaceHint='/tmp/voltagent-e2e-workspace'
      />,
    )
    await expect
      .element(page.getByTestId('document-workspace-hint'))
      .toHaveTextContent('工作区：/tmp/voltagent-e2e-workspace')
  })
})
