/** Live label matches the collapsed reasoning row; settled copy stays 深度思考. */
export function reasoningLabel(streaming: boolean): string {
  return streaming ? '思考中…' : '深度思考'
}

/** Latest thought line for the collapsed row preview. */
export function reasoningPreview(body: string | undefined): string | undefined {
  if (!body?.trim()) return undefined
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines[lines.length - 1]
}
