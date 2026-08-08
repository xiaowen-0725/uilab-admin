/**
 * Extension → document format family (ticket 04: text / markdown / code only).
 * Heavy formats (image/pdf/office) → unsupported here; ticket 05 expands.
 */

export type DocumentFormatFamily =
  | 'text'
  | 'markdown'
  | 'code'
  | 'unsupported'

const TEXT_EXT = new Set([
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'properties',
])

const MARKDOWN_EXT = new Set(['md', 'mdx', 'markdown'])

const CODE_EXT = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'vue',
  'svelte',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'dockerfile',
  'graphql',
  'gql',
  'r',
  'lua',
  'pl',
  'pm',
  'scala',
  'clj',
  'ex',
  'exs',
  'zig',
  'nim',
  'dart',
  'proto',
  'tf',
  'makefile',
  'cmake',
])

/** Map extension (no dot) → Shiki / display language id. */
const CODE_LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  graphql: 'graphql',
  gql: 'graphql',
  r: 'r',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  scala: 'scala',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  md: 'markdown',
  mdx: 'markdown',
}

export function extensionOf(resourceKey: string): string {
  const base = resourceKey.split('/').pop() ?? resourceKey
  // Dockerfile, Makefile without extension
  const lower = base.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile') return 'makefile'
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function resolveDocumentFormat(
  resourceKey: string,
): DocumentFormatFamily {
  const ext = extensionOf(resourceKey)
  if (!ext) {
    // No extension: treat as plain text if basename looks like a file name
    return resourceKey.includes('/') ? 'text' : 'unsupported'
  }
  if (MARKDOWN_EXT.has(ext)) return 'markdown'
  if (CODE_EXT.has(ext)) return 'code'
  if (TEXT_EXT.has(ext)) return 'text'
  // json/yaml often treated as text; already in TEXT_EXT
  return 'unsupported'
}

/** Language id for code highlighting; unknown → text. */
export function codeLanguageFor(resourceKey: string): string {
  const ext = extensionOf(resourceKey)
  return CODE_LANG_BY_EXT[ext] ?? 'text'
}
