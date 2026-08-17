/** Coarse relative time for board and widget freshness copy. */
export function formatRelative(at: string | number, now = Date.now()): string {
  const then = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(then)) return '刚刚'
  const minutes = Math.round((now - then) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}
