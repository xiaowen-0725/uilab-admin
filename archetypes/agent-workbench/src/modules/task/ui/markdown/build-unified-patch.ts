/**
 * Build a unified-diff patch string from Timeline file-change meta lines.
 * Input is projection-owned `{ type, text }[]`; output feeds `@pierre/diffs` `processFile`.
 */

export type DiffLineInput = {
  type: 'add' | 'del' | 'context'
  text: string
}

/**
 * Emit a single-file unified patch suitable for `processFile(patch)`.
 * Hunk counts use line inventory (not absolute line numbers from meta).
 */
export function buildUnifiedPatch(
  path: string,
  lines: readonly DiffLineInput[],
): string {
  const safePath = path.replace(/\\/g, '/').replace(/^\//, '') || 'file'
  let oldCount = 0
  let newCount = 0
  const body: string[] = []

  for (const line of lines) {
    const text = line.text.replace(/\r?\n$/, '')
    if (line.type === 'add') {
      newCount += 1
      body.push(`+${text}`)
    } else if (line.type === 'del') {
      oldCount += 1
      body.push(`-${text}`)
    } else {
      oldCount += 1
      newCount += 1
      body.push(` ${text}`)
    }
  }

  // Empty diff still needs a valid header so processFile can attach a name.
  if (body.length === 0) {
    return [`--- a/${safePath}`, `+++ b/${safePath}`, '@@ -0,0 +0,0 @@', ''].join(
      '\n',
    )
  }

  return [
    `--- a/${safePath}`,
    `+++ b/${safePath}`,
    `@@ -1,${Math.max(oldCount, 1)} +1,${Math.max(newCount, 1)} @@`,
    ...body,
    '',
  ].join('\n')
}
