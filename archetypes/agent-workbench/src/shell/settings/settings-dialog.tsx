import type { ReactNode } from 'react'
import { ComputerDesktopIcon as Monitor, MoonIcon as Moon, Cog6ToothIcon as SettingsIcon, SunIcon as Sun, UserCircleIcon as UserRound, XMarkIcon as X } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
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

const THEME_OPTIONS: {
  value: ThemePreference
  label: string
  icon: typeof Monitor
  Preview: () => ReactNode
}[] = [
  {
    value: 'system',
    label: '跟随系统',
    icon: Monitor,
    Preview: SystemThemePreview,
  },
  { value: 'light', label: '浅色', icon: Sun, Preview: LightThemePreview },
  { value: 'dark', label: '深色', icon: Moon, Preview: DarkThemePreview },
]

/**
 * Modal settings shell for the Workbench template (shadcn Base UI Dialog).
 * Sections stay fixture-honest: profile is demo data; appearance toggles local theme only.
 */
export function SettingsDialog({
  open,
  section,
  onSectionChange,
  onClose,
  user = DEMO_NAVIGATOR_USER,
}: SettingsDialogProps) {
  const { preference, setPreference } = useThemePreference()
  const sectionLabel =
    SECTIONS.find((item) => item.id === section)?.label ?? '设置'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-testid='settings-dialog'
        className={cn(
          'flex h-[min(640px,85vh)] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl bg-background p-0 text-foreground sm:max-w-[880px]',
          'shadow-[0_24px_80px_color-mix(in_oklch,var(--foreground)_22%,transparent)]'
        )}
      >
        <DialogTitle className='sr-only'>设置</DialogTitle>
        <DialogDescription className='sr-only'>
          工作台设置：个人资料与外观
        </DialogDescription>

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
                <Button
                  key={item.id}
                  type='button'
                  variant='ghost'
                  data-testid={`settings-nav-${item.id}`}
                  data-selected={selected ? 'true' : 'false'}
                  className={cn(
                    'h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 text-sm font-normal',
                    selected
                      ? 'bg-background font-medium shadow-sm hover:bg-background'
                      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                  )}
                  onClick={() => onSectionChange(item.id)}
                >
                  <Icon aria-hidden />
                  {item.label}
                </Button>
              )
            })}
          </nav>
        </aside>

        <div className='flex min-w-0 flex-1 flex-col'>
          <header className='flex h-12 shrink-0 items-center justify-between border-b border-border px-5'>
            <h2 className='text-sm font-semibold'>{sectionLabel}</h2>
            <DialogClose
              data-testid='settings-dialog-close'
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  className='text-muted-foreground'
                  aria-label='关闭设置'
                />
              }
            >
              <X aria-hidden />
            </DialogClose>
          </header>

          <ScrollArea className='min-h-0 flex-1'>
            <div className='p-5'>
              {section === 'profile' ? (
                <ProfileSection user={user} />
              ) : (
                <AppearanceSection
                  preference={preference}
                  onPreferenceChange={setPreference}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
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
    <div className='flex flex-col gap-4'>
      <div>
        <h3 className='text-sm font-medium'>主题</h3>
        <p className='mt-1 text-xs text-muted-foreground'>
          选择工作台外观。跟随系统会随操作系统深浅色自动切换。
        </p>
      </div>

      <RadioGroup
        value={preference}
        onValueChange={(value) =>
          onPreferenceChange(value as ThemePreference)
        }
        className='grid grid-cols-1 gap-3 sm:grid-cols-3'
        aria-label='主题'
        data-testid='settings-theme-group'
      >
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.value
          const Icon = option.icon
          const Preview = option.Preview
          return (
            <label
              key={option.value}
              data-testid={`settings-theme-${option.value}`}
              data-selected={selected ? 'true' : 'false'}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-xl bg-card p-2 text-left transition-colors',
                'focus-within:ring-3 focus-within:ring-ring/50',
                selected
                  ? 'border-2 border-primary shadow-sm'
                  : 'border border-border hover:border-foreground/25'
              )}
            >
              <RadioGroupItem value={option.value} className='sr-only' />
              <div className='overflow-hidden rounded-lg border border-border'>
                <Preview />
              </div>
              <span className='flex items-center gap-1.5 px-1 pb-0.5 text-sm font-medium'>
                <Icon className='size-3.5 text-muted-foreground' aria-hidden />
                {option.label}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}

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
