import type {
  DocumentBinaryReadResult,
  DocumentContentPort,
  DocumentTextReadResult,
} from '../ports/document-content-port'
import {
  maxBytesForFamily,
  normalizeWorkspaceResourceKey,
} from '../surfaces/document/path-utils'
import { resolveDocumentFormat } from '../surfaces/document/format-router'
import {
  FIXTURE_DOCX_B64,
  FIXTURE_PDF_B64,
  FIXTURE_PNG_B64,
  FIXTURE_XLSX_B64,
} from '../surfaces/document/fixtures/binary-fixtures'

export type MemoryDocumentContentOptions = {
  files?: Record<string, string>
  /** Binary files: resourceKey → Uint8Array */
  binaryFiles?: Record<string, Uint8Array>
  maxBytes?: number
}

function b64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array()
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Built-in text fixtures used by product Fake open path + contract tests. */
export const DEFAULT_DOCUMENT_FIXTURES: Record<string, string> = {
  'fixture/notes/workflow-result.md': [
    '# Synthetic Fixture Workflow Result',
    '',
    'Plan steps completed in Deterministic Fake path.',
    '',
    '## Checklist',
    '- [x] read plan',
    '- [x] read alpha',
    '- [x] list dir',
    '- [x] write result',
  ].join('\n'),
  'fixture/notes/plan.txt': [
    '1. 读取 plan',
    '2. 读取 alpha',
    '3. 写入结果',
  ].join('\n'),
  'fixture/notes/alpha.txt': 'alpha sample\n',
  'src/modules/task/projection/project-events.ts': [
    '// sample projection stub for Document Surface preview',
    'export function projectEvents() {',
    "  return { ok: true as const }",
    '}',
  ].join('\n'),
  'demo/hello.py': [
    'def greet(name: str) -> str:',
    '    return f"hello, {name}"',
    '',
    'if __name__ == "__main__":',
    '    print(greet("world"))',
  ].join('\n'),
  'demo/empty.txt': '',
}

export const DEFAULT_BINARY_FIXTURES: Record<string, Uint8Array> = {
  'demo/pixel.png': b64ToBytes(FIXTURE_PNG_B64),
  'demo/hello.pdf': b64ToBytes(FIXTURE_PDF_B64),
  'demo/sheet.xlsx': b64ToBytes(FIXTURE_XLSX_B64),
  'demo/letter.docx': b64ToBytes(FIXTURE_DOCX_B64),
}

/**
 * In-memory DocumentContentPort for tests and Fake Runtime product path.
 */
export function createMemoryDocumentContent(
  options: MemoryDocumentContentOptions = {},
): DocumentContentPort {
  const textStore = new Map<string, string>()
  const binaryStore = new Map<string, Uint8Array>()

  const seedText = { ...DEFAULT_DOCUMENT_FIXTURES, ...(options.files ?? {}) }
  for (const [k, v] of Object.entries(seedText)) {
    const key = normalizeWorkspaceResourceKey(k)
    if (key) textStore.set(key, v)
  }
  const seedBin = { ...DEFAULT_BINARY_FIXTURES, ...(options.binaryFiles ?? {}) }
  for (const [k, v] of Object.entries(seedBin)) {
    const key = normalizeWorkspaceResourceKey(k)
    if (key) binaryStore.set(key, v)
  }

  return {
    async readText(resourceKey: string): Promise<DocumentTextReadResult> {
      const key = normalizeWorkspaceResourceKey(resourceKey)
      if (!key) return { ok: false, reason: 'not-found' }
      if (!textStore.has(key)) return { ok: false, reason: 'not-found' }
      const text = textStore.get(key)!
      const byteLength = new TextEncoder().encode(text).length
      const family = resolveDocumentFormat(key)
      const max = options.maxBytes ?? maxBytesForFamily(family)
      if (byteLength > max) {
        return {
          ok: false,
          reason: 'too-large',
          message: `超过 ${max} 字节上限`,
        }
      }
      return { ok: true, text, byteLength }
    },

    async readBinary(resourceKey: string): Promise<DocumentBinaryReadResult> {
      const key = normalizeWorkspaceResourceKey(resourceKey)
      if (!key) return { ok: false, reason: 'not-found' }
      // Prefer binary store; fall back to text-as-utf8 for tests
      let bytes = binaryStore.get(key)
      if (!bytes && textStore.has(key)) {
        bytes = new TextEncoder().encode(textStore.get(key)!)
      }
      if (!bytes) return { ok: false, reason: 'not-found' }
      const family = resolveDocumentFormat(key)
      const max = options.maxBytes ?? maxBytesForFamily(family)
      if (bytes.byteLength > max) {
        return {
          ok: false,
          reason: 'too-large',
          message: `超过 ${max} 字节上限`,
        }
      }
      return {
        ok: true,
        bytes,
        byteLength: bytes.byteLength,
      }
    },
  }
}
