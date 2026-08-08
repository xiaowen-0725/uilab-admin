import { describe, expect, it } from 'vitest'
import {
  createFsAccessDocumentContent,
  fsAccessWorkspaceHint,
  isFsAccessDirectoryPickerSupported,
  pickWorkspaceDirectory,
  resolveFsAccessFileHandle,
} from './fs-access-document-content'

function mockFileHandle(
  name: string,
  content: string | Uint8Array,
  type = 'text/plain',
): FileSystemFileHandle {
  const bytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return {
    kind: 'file',
    name,
    getFile: async () => new File([ab], name, { type }),
    createWritable: async () => {
      throw new Error('read-only test mock')
    },
    isSameEntry: async () => false,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  } as unknown as FileSystemFileHandle
}

function mockDirHandle(
  name: string,
  children: Record<string, FileSystemFileHandle | FileSystemDirectoryHandle>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    getFileHandle: async (n: string) => {
      const child = children[n]
      if (!child || child.kind !== 'file') {
        throw new DOMException('not found', 'NotFoundError')
      }
      return child
    },
    getDirectoryHandle: async (n: string) => {
      const child = children[n]
      if (!child || child.kind !== 'directory') {
        throw new DOMException('not found', 'NotFoundError')
      }
      return child
    },
    removeEntry: async () => {},
    resolve: async () => null,
    keys: async function* () {},
    values: async function* () {},
    entries: async function* () {},
    isSameEntry: async () => false,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  } as unknown as FileSystemDirectoryHandle
}

describe('isFsAccessDirectoryPickerSupported', () => {
  it('detects showDirectoryPicker presence', () => {
    expect(
      isFsAccessDirectoryPickerSupported({} as Window),
    ).toBe(false)
    expect(
      isFsAccessDirectoryPickerSupported({
        showDirectoryPicker: async () => mockDirHandle('x', {}),
      } as unknown as Window),
    ).toBe(true)
  })
})

describe('pickWorkspaceDirectory', () => {
  it('returns unsupported when API missing', async () => {
    const r = await pickWorkspaceDirectory({} as Window)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('unsupported')
      expect(r.message).toMatch(/不支持|Chromium/)
    }
  })

  it('returns handle on success', async () => {
    const handle = mockDirHandle('ws', {})
    const r = await pickWorkspaceDirectory({
      showDirectoryPicker: async () => handle,
    } as unknown as Window)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.handle).toBe(handle)
  })

  it('maps AbortError to aborted', async () => {
    const r = await pickWorkspaceDirectory({
      showDirectoryPicker: async () => {
        throw new DOMException('user cancel', 'AbortError')
      },
    } as unknown as Window)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('aborted')
      expect(r.message).toMatch(/取消/)
    }
  })
})

describe('resolveFsAccessFileHandle + createFsAccessDocumentContent', () => {
  const root = mockDirHandle('workspace', {
    notes: mockDirHandle('notes', {
      'seed.md': mockFileHandle('seed.md', '# seed\n'),
    }),
    'readme.txt': mockFileHandle('readme.txt', 'hello local\n'),
  })

  it('resolves nested and top-level files', async () => {
    const nested = await resolveFsAccessFileHandle(root, 'notes/seed.md')
    expect(nested.ok).toBe(true)
    const top = await resolveFsAccessFileHandle(root, 'readme.txt')
    expect(top.ok).toBe(true)
  })

  it('rejects path escape and missing files', async () => {
    const escape = await resolveFsAccessFileHandle(root, '../secret')
    expect(escape.ok).toBe(false)
    const missing = await resolveFsAccessFileHandle(root, 'nope.md')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('not-found')
  })

  it('reads text via DocumentContentPort', async () => {
    const port = createFsAccessDocumentContent({ root })
    const result = await port.readText('readme.txt')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain('hello local')

    const nested = await port.readText('notes/seed.md')
    expect(nested.ok).toBe(true)
    if (nested.ok) expect(nested.text).toContain('# seed')
  })

  it('reports too-large for oversized files', async () => {
    const big = mockDirHandle('ws', {
      'huge.txt': mockFileHandle('huge.txt', 'x'.repeat(100)),
    })
    // Force tiny ceiling by using a binary family path with max from path-utils
    // text max is 1.5MB; use mock that reports huge size via custom getFile
    const oversize = {
      kind: 'file' as const,
      name: 'big.bin',
      getFile: async () =>
        ({
          size: 50 * 1024 * 1024,
          type: 'application/octet-stream',
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as File,
    } as unknown as FileSystemFileHandle
    const rootBig = mockDirHandle('ws', {
      'photo.png': oversize,
    })
    const port = createFsAccessDocumentContent({ root: rootBig })
    const result = await port.readBinary!('photo.png')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too-large')
    void big
  })

  it('fsAccessWorkspaceHint labels the folder', () => {
    expect(fsAccessWorkspaceHint(root)).toBe('本地文件夹 · workspace')
    expect(fsAccessWorkspaceHint(root, ' 自定义 ')).toBe(
      '本地文件夹 · 自定义',
    )
  })
})
