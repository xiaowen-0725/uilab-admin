/**
 * Browser-safe local-root path helpers. No Node built-ins (renderer gate).
 * Absolute-ize, strip trailing slashes, collapse `.` / `..` (path.normalize 级).
 * Does not fold case (macOS conservative).
 */

import type { WorkbenchProductProfile } from '@/config/workbench-product-profile'

const WINDOWS_DRIVE = /^[A-Za-z]:\//

export function expandHome(input: string, homeDir: string): string {
  const trimmed = input.trim()
  const home = normalizeLocalRoot(homeDir)
  if (trimmed === '~') return home
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return normalizeLocalRoot(`${home}/${trimmed.slice(2)}`)
  }
  return trimmed
}

/**
 * Normalize a local folder path to a comparable absolute form.
 * Throws a Chinese error when the path is empty or not absolute.
 */
export function normalizeLocalRoot(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('路径无效：不能为空')
  }

  const unix = trimmed.replace(/\\/g, '/')
  const isWinAbs = WINDOWS_DRIVE.test(unix)
  const isUnc = unix.startsWith('//')
  const isPosixAbs = unix.startsWith('/')
  if (!isWinAbs && !isUnc && !isPosixAbs) {
    throw new Error('路径无效：必须是绝对路径')
  }

  let prefix = ''
  let rest = unix
  if (isWinAbs) {
    prefix = unix.slice(0, 2)
    rest = unix.slice(2)
  } else if (isUnc) {
    prefix = '/'
    rest = unix.slice(1)
  }

  const parts = rest.split('/').filter((segment, index) => {
    if (segment === '') return index === 0 && !isWinAbs
    return true
  })

  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(part)
  }

  if (isWinAbs) {
    return stack.length === 0 ? `${prefix}/` : `${prefix}/${stack.join('/')}`
  }
  if (stack.length === 0) return '/'
  return `/${stack.join('/')}`
}

export function basenameOfRoot(root: string): string {
  const normalized = normalizeLocalRoot(root)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return normalized
  const last = parts[parts.length - 1] ?? normalized
  // Windows drive-only (`C:/`) has no useful basename.
  if (WINDOWS_DRIVE.test(`${last}/`) && parts.length === 1 && last.length === 2) {
    return normalized
  }
  return last
}

export function resolveProjectsHomePath(
  homeDir: string,
  profile: WorkbenchProductProfile,
): string {
  if (profile.projectsHomeOverride?.trim()) {
    return normalizeLocalRoot(
      expandHome(profile.projectsHomeOverride, homeDir),
    )
  }
  const home = normalizeLocalRoot(homeDir)
  return normalizeLocalRoot(`${home}/${profile.projectsHomeDirName}`)
}

export function sanitizeDirectoryName(name: string): string {
  const trimmed = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  return trimmed || '未命名项目'
}

function formatStamp(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

/**
 * Unique child directory name under Projects Home.
 * Same-name conflict → timestamp suffix, then numeric `-2`, `-3`, …
 */
export function uniqueChildDirectoryName(
  preferredName: string,
  existingNames: readonly string[],
  now: Date = new Date(),
): string {
  const existing = new Set(existingNames)
  const base = sanitizeDirectoryName(preferredName)
  if (!existing.has(base)) return base
  const stamp = formatStamp(now)
  let candidate = `${base}-${stamp}`
  let n = 2
  while (existing.has(candidate)) {
    candidate = `${base}-${stamp}-${n}`
    n += 1
  }
  return candidate
}
