/**
 * XLSX read-only table preview — `xlsx` (SheetJS community) is dynamically imported.
 * No formula edit / write-back APIs are exposed.
 */
import { useEffect, useState } from 'react'
import {
  DOCUMENT_XLSX_MAX_COLS,
  DOCUMENT_XLSX_MAX_ROWS,
} from '../path-utils'

export interface XlsxRendererProps {
  bytes: Uint8Array
  resourceKey: string
  onFailed?: () => void
}

type SheetView = {
  name: string
  rows: string[][]
}

export function XlsxRenderer({
  bytes,
  resourceKey,
  onFailed,
}: XlsxRendererProps) {
  const [sheet, setSheet] = useState<SheetView | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSheet(null)
    setError(false)
    ;(async () => {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
        const name = wb.SheetNames[0]
        if (!name) {
          if (!cancelled) setSheet({ name: '', rows: [] })
          return
        }
        const ws = wb.Sheets[name]
        const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
          ws,
          {
            header: 1,
            defval: '',
            raw: false,
          },
        ) as unknown as (string | number | boolean | null)[][]
        const rows = aoa
          .slice(0, DOCUMENT_XLSX_MAX_ROWS)
          .map((row) =>
            (row ?? [])
              .slice(0, DOCUMENT_XLSX_MAX_COLS)
              .map((c) => (c == null ? '' : String(c))),
          )
        if (!cancelled) setSheet({ name, rows })
      } catch {
        if (!cancelled) {
          setError(true)
          onFailed?.()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bytes, onFailed])

  if (error) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-testid='document-renderer-xlsx'
        data-state='failed'
      >
        表格渲染失败。
      </p>
    )
  }

  if (!sheet) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-testid='document-renderer-xlsx'
      >
        正在加载表格…
      </p>
    )
  }

  if (sheet.rows.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-testid='document-renderer-xlsx'
        data-resource-key={resourceKey}
      >
        工作表为空。
      </p>
    )
  }

  return (
    <div
      className='min-h-0 flex-1 overflow-auto'
      data-testid='document-renderer-xlsx'
      data-resource-key={resourceKey}
      data-sheet={sheet.name}
      data-readonly='true'
    >
      <p className='mb-2 text-xs text-muted-foreground'>
        只读预览 · {sheet.name || '工作表'}（最多 {DOCUMENT_XLSX_MAX_ROWS} 行 ×{' '}
        {DOCUMENT_XLSX_MAX_COLS} 列）
      </p>
      <table className='w-full border-collapse text-left text-[12px]'>
        <tbody>
          {sheet.rows.map((row, ri) => (
            <tr key={ri} className='border-b border-border/50'>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className='max-w-[12rem] truncate px-2 py-1 font-mono text-foreground'
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
