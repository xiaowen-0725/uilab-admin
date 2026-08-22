/** Chinese relative time for Navigator catalog rows. */
export function formatRelativeTimeZh(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const delta = Math.max(0, nowMs - then)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(delta / 86_400_000)
  return `${days}天前`
}
