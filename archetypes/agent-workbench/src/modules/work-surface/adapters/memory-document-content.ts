import type {
  DocumentContentPort,
  DocumentReadResult,
} from '../ports/document-content-port'
import {
  DOCUMENT_TEXT_MAX_BYTES,
  normalizeWorkspaceResourceKey,
} from '../surfaces/document/path-utils'

export type MemoryDocumentContentOptions = {
  files?: Record<string, string>
  maxBytes?: number
}

/** Built-in fixtures used by product Fake open path + contract tests. */
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

/**
 * In-memory DocumentContentPort for tests and Fake Runtime product path.
 * Paths are normalized; unknown keys → not-found; oversized → too-large.
 */
export function createMemoryDocumentContent(
  options: MemoryDocumentContentOptions = {},
): DocumentContentPort {
  const maxBytes = options.maxBytes ?? DOCUMENT_TEXT_MAX_BYTES
  const store = new Map<string, string>()

  const seed = { ...DEFAULT_DOCUMENT_FIXTURES, ...(options.files ?? {}) }
  for (const [k, v] of Object.entries(seed)) {
    const key = normalizeWorkspaceResourceKey(k)
    if (key) store.set(key, v)
  }

  return {
    async readText(resourceKey: string): Promise<DocumentReadResult> {
      const key = normalizeWorkspaceResourceKey(resourceKey)
      if (!key) {
        return { ok: false, reason: 'not-found' }
      }
      if (!store.has(key)) {
        return { ok: false, reason: 'not-found' }
      }
      const text = store.get(key)!
      // Approximate UTF-8 byte length
      const byteLength = new TextEncoder().encode(text).length
      if (byteLength > maxBytes) {
        return {
          ok: false,
          reason: 'too-large',
          message: `超过 ${maxBytes} 字节上限`,
        }
      }
      return { ok: true, text, byteLength }
    },
  }
}
