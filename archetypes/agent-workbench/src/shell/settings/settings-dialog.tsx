import { useEffect, useId, useRef, type ReactNode } from 'react'
import {
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import {
  DEMO_NAVIGATOR_USER,
  type NavigatorUser,
} from '../navigator/navigator-user-menu'
import { useThemePreference } from '../theme/theme-provider'
import type { ThemePreference } from '../theme/theme-preference'

export type SettingsSectionId = 'profile' | 'appearance'

export interface SettingsDialogProps {
  open: boolean
  section: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
  onClose: () => void
  user?: NavigatorUser
}

const SECTIONS: {
  id: SettingsSectionId
  label: string
  icon: typeof UserRound
}[] = [
  { id: 'profile', label: '个人资料', icon: UserRound },
  { id: 'appearance', label: '外观', icon: Sun },
]

/**
 * Modal settings shell for the Workbench template.
 * Sections stay fixture-honest: profile is demo data; appearance toggles local theme only.
 */
export function SettingsDialog({
  open,
  section,
  onSectionChange,
  onClose,
  user = DEMO_NAVIGATOR_USER,
}: SettingsDialogProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const { preference, setPreference } = useThemePreference()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => closeRef.current?.focus(), 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center p-4'
      data-slot='settings-dialog-root'
      data-testid='settings-dialog'
    >
      <button
        type='button'
        className='absolute inset-0 bg-foreground/40'
        aria-label='关闭设置'
        data-testid='settings-dialog-backdrop'
        onClick={onClose}
      />

      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        data-testid='settings-dialog-panel'
        className='relative flex h-[min(640px,85vh)] w-full max-w-[880px] overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-[0_24px_80px_color-mix(in_oklch,var(--foreground)_22%,transparent)]'
      >
        {/* Left section nav */}
        <aside
          className='flex w-[200px] shrink-0 flex-col border-r border-border bg-muted/40'
          data-slot='settings-nav'
        >
          <div className='flex items-center gap-2 px-4 py-4 text-sm font-semibold'>
            <SettingsIcon className='size-4' aria-hidden />
            设置
          </div>
          <nav className='flex flex-col gap-0.5 px-2 pb-3' aria-label='设置分段'>
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const selected = section === item.id
              return (
                <button
                  key={item.id}
                  type='button'
                  data-testid={`settings-nav-${item.id}`}
                  data-selected={selected ? 'true' : 'false'}
                  className={
                    selected
                      ? 'flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-left text-sm font-medium shadow-sm'
                      : 'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background/70 hover:text-foreground'
                  }
                  onClick={() => onSectionChange(item.id)}
                >
                  <Icon className='size-4 shrink-0' aria-hidden />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Main pane */}
        <div className='flex min-w-0 flex-1 flex-col'>
          <header className='flex h-12 shrink-0 items-center justify-between border-b border-border px-5'>
            <h2 id={titleId} className='text-sm font-semibold'>
              {SECTIONS.find((s) => s.id === section)?.label ?? '设置'}
            </h2>
            <button
              ref={closeRef}
              type='button'
              data-testid='settings-dialog-close'
              className='inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
              aria-label='关闭设置'
              onClick={onClose}
            >
              <X className='size-4' aria-hidden />
            </button>
          </header>

          <div className='min-h-0 flex-1 overflow-y-auto p-5'>
            {section === 'profile' ? (
              <ProfileSection user={user} />
            ) : (
              <AppearanceSection
                preference={preference}
                onPreferenceChange={setPreference}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileSection({ user }: { user: NavigatorUser }) {
  return (
    <div className='mx-auto flex max-w-lg flex-col items-center gap-4 pt-6 text-center'>
      <span
        className='flex size-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground'
        aria-hidden
      >
        {user.initials}
      </span>
      <div>
        <p
          className='text-lg font-semibold tracking-tight'
          data-testid='settings-profile-name'
        >
          {user.name}
        </p>
        <p
          className='mt-1 text-sm text-muted-foreground'
          data-testid='settings-profile-email'
        >
          {user.email}
        </p>
      </div>
      <p className='rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
        静态演示账户 — 无真实鉴权 / 无远程资料同步
      </p>
    </div>
  )
}

function AppearanceSection({
  preference,
  onPreferenceChange,
}: {
  preference: ThemePreference
  onPreferenceChange: (next: ThemePreference) => void
}) {
  return (
    <div className='space-y-4'>
      <div>
        <h3 className='text-sm font-medium'>主题</h3>
        <p className='mt-1 text-xs text-muted-foreground'>
          选择工作台外观。跟随系统会随操作系统深浅色自动切换。
        </p>
      </div>

      <div
        className='grid grid-cols-1 gap-3 sm:grid-cols-3'
        role='radiogroup'
        aria-label='主题'
        data-testid='settings-theme-group'
      >
        <ThemeCard
          value='system'
          label='跟随系统'
          selected={preference === 'system'}
          onSelect={onPreferenceChange}
          preview={<SystemThemePreview />}
        />
        <ThemeCard
          value='light'
          label='浅色'
          selected={preference === 'light'}
          onSelect={onPreferenceChange}
          preview={<LightThemePreview />}
        />
        <ThemeCard
          value='dark'
          label='深色'
          selected={preference === 'dark'}
          onSelect={onPreferenceChange}
          preview={<DarkThemePreview />}
        />
      </div>
    </div>
  )
}

function ThemeCard({
  value,
  label,
  selected,
  onSelect,
  preview,
}: {
  value: ThemePreference
  label: string
  selected: boolean
  onSelect: (value: ThemePreference) => void
  preview: ReactNode
}) {
  const Icon =
    value === 'system' ? Monitor : value === 'light' ? Sun : Moon

  return (
    <button
      type='button'
      role='radio'
      aria-checked={selected}
      data-testid={`settings-theme-${value}`}
      data-selected={selected ? 'true' : 'false'}
      className={
        selected
          ? 'flex flex-col gap-2 rounded-xl border-2 border-primary bg-card p-2 text-left shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50'
          : 'flex flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50'
      }
      onClick={() => onSelect(value)}
    >
      <div className='overflow-hidden rounded-lg border border-border'>
        {preview}
      </div>
      <span className='flex items-center gap-1.5 px-1 pb-0.5 text-sm font-medium'>
        <Icon className='size-3.5 text-muted-foreground' aria-hidden />
        {label}
      </span>
    </button>
  )
}

/** Mini mock window — system (split light/dark). */
function SystemThemePreview() {
  return (
    <div className='flex h-20 w-full overflow-hidden'>
      <div className='flex w-1/2 flex-col gap-1.5 bg-[#f7f7f7] p-2'>
        <div className='h-1.5 w-8 rounded bg-[#e5e5e5]' />
        <div className='h-1.5 w-12 rounded bg-[#e5e5e5]' />
        <div className='mt-auto h-6 rounded border border-[#e5e5e5] bg-[#ffffff]' />
      </div>
      <div className='flex w-1/2 flex-col gap-1.5 bg-[#1a1a1a] p-2'>
        <div className='h-1.5 w-8 rounded bg-[#2a2a2a]' />
        <div className='h-1.5 w-12 rounded bg-[#2a2a2a]' />
        <div className='mt-auto h-6 rounded border border-white/10 bg-[#0d0d0d]' />
      </div>
    </div>
  )
}

function LightThemePreview() {
  return (
    <div className='flex h-20 w-full flex-col gap-1.5 bg-[#f7f7f7] p-2'>
      <div className='flex flex-1 gap-1.5'>
        <div className='w-5 rounded bg-[#ececec]' />
        <div className='flex flex-1 flex-col gap-1 rounded border border-[#e5e5e5] bg-[#ffffff] p-1.5'>
          <div className='h-1.5 w-10 rounded bg-[#e5e5e5]' />
          <div className='h-1.5 w-14 rounded bg-[#f4f4f5]' />
          <div className='mt-auto h-4 rounded bg-[#f4f4f5]' />
        </div>
      </div>
    </div>
  )
}

function DarkThemePreview() {
  return (
    <div className='flex h-20 w-full flex-col gap-1.5 bg-[#1a1a1a] p-2'>
      <div className='flex flex-1 gap-1.5'>
        <div className='w-5 rounded bg-[#262626]' />
        <div className='flex flex-1 flex-col gap-1 rounded border border-white/10 bg-[#0d0d0d] p-1.5'>
          <div className='h-1.5 w-10 rounded bg-[#2a2a2a]' />
          <div className='h-1.5 w-14 rounded bg-[#1f1f1f]' />
          <div className='mt-auto h-4 rounded bg-[#161616]' />
        </div>
      </div>
    </div>
  )
}
