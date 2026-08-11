/**
 * Lazy entry points for heavy Document renderers (A7).
 * Task-only code paths must not statically import mammoth / xlsx.
 * Call sites use `await import('./heavy-lazy')` then these factories.
 */

export async function loadImageRenderer() {
  const m = await import('./image-renderer')
  return m.ImageRenderer
}

export async function loadPdfRenderer() {
  const m = await import('./pdf-renderer')
  return m.PdfRenderer
}

export async function loadDocxRenderer() {
  const m = await import('./docx-renderer')
  return m.DocxRenderer
}

export async function loadXlsxRenderer() {
  const m = await import('./xlsx-renderer')
  return m.XlsxRenderer
}
