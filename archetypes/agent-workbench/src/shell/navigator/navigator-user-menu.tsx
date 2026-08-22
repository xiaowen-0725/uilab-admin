import { useEffect, useId, useState, type ComponentType, type SVGProps } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useThemePreference } from '../theme/theme-provider'
import {
  BellIcon,
  HelpCircleIcon,
  PaletteIcon,
  SettingsHexIcon,
  SignOutIcon,
  UpdateCircleIcon,
} from './navigator-icons'

/** Static Shell demo user — not a real auth session. */
export interface NavigatorUser {
  name: string
  email: string
  /** One or two characters for the avatar fallback. */
  initials: string
}

export const DEMO_NAVIGATOR_USER: NavigatorUser = {
  name: '演示用户',
  email: 'demo@uilab.dev',
  initials: '演',
}

export interface NavigatorUserMenuProps {
  user?: NavigatorUser
  /** When false, controls are not focusable (Navigator closed). */
  interactive: boolean
  /** Opens the Workbench settings dialog (owned by Shell). */
  onOpenSettings?: () => void
}

const footerIconBtnClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-black/70 outline-none transition-colors duration-200 ease-in-out hover:bg-black/[0.03] hover:text-black/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 dark:text-white/56 dark:hover:bg-white/[0.05] dark:hover:text-white/84'

const menuRowClass =
  'flex h-9 items-center gap-2 rounded-[8px] px-3 text-[14px] leading-[22px] text-black/90 dark:text-white/84'

const menuItemClass = cn(
  menuRowClass,
  'font-normal focus:bg-[#f2f2f2] focus:text-black/90 dark:focus:bg-white/[0.08] [&_svg]:size-4 [&_svg]:text-current',
)

/**
 * Account chip at the Navigator foot (shadcn Base UI DropdownMenu).
 * Menu opens upward; Settings opens the Shell dialog; Sign-out stays fixture-only.
 */
export function NavigatorUserMenu({
  user = DEMO_NAVIGATOR_USER,
  interactive,
  onOpenSettings,
}: NavigatorUserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = useId()
  const tabIndex = interactive ? 0 : -1
  const { resolvedDark, setPreference } = useThemePreference()

  useEffect(() => {
    if (!interactive) {
      setMenuOpen(false)
      setNotice(null)
    }
  }, [interactive])

  function handleMenuOpenChange(open: boolean) {
    if (!interactive) return
    setMenuOpen(open)
    if (open) setNotice(null)
  }

  return (
    <div
      className='relative shrink-0 px-3 pe-4 py-3'
      data-slot='navigator-user-menu'
      data-testid='navigator-user-menu'
      data-open={menuOpen ? 'true' : 'false'}
    >
      <div className='flex h-11 items-center gap-1'>
        <DropdownMenu
          open={interactive ? menuOpen : false}
          onOpenChange={handleMenuOpenChange}
        >
          <DropdownMenuTrigger
            disabled={!interactive}
            render={
              <button
                type='button'
                data-testid='navigator-user-trigger'
                className={cn(
                  'flex h-11 min-w-0 flex-1 items-center rounded-[8px] px-2 py-1 text-left',
                  'hover:bg-black/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/[0.05]',
                  'data-[popup-open]:bg-black/[0.05] data-[open]:bg-black/[0.05] dark:data-[popup-open]:bg-white/[0.10] dark:data-[open]:bg-white/[0.10]'
                )}
                aria-label={`账户：${user.name}`}
                title='账户菜单'
                tabIndex={tabIndex}
              />
            }
          >
            <span className='flex min-w-0 items-center gap-2.5'>
              <UserAvatar user={user} />
              <span className='truncate text-[12px] font-semibold leading-none text-black dark:text-white/84'>
                {user.name}
              </span>
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side='top'
            align='start'
            sideOffset={8}
            data-testid='navigator-user-menu-panel'
            className='w-[232px] rounded-[12px] p-2 text-black shadow-[0_6px_24px_rgba(0,0,0,0.04),0_4px_6px_rgba(0,0,0,0.04)] ring-1 ring-black/6 dark:text-white dark:shadow-[0_8px_28px_rgba(0,0,0,0.35)] dark:ring-white/10'
            aria-label='账户菜单'
          >
            <DropdownMenuGroup>
              <AccountMenuItem
                testId='navigator-user-settings'
                icon={SettingsHexIcon}
                label='设置'
                onClick={() => {
                  setNotice(null)
                  onOpenSettings?.()
                }}
              />

              <div
                data-testid='navigator-user-appearance'
                className={menuRowClass}
              >
                <PaletteIcon className='size-4 shrink-0' />
                <span>外观</span>
                <div
                  role='group'
                  aria-label='外观'
                  className='ms-auto flex h-7 items-center rounded-lg bg-black/[0.06] p-0.5 dark:bg-white/[0.08]'
                >
                  <ThemeSegment
                    label='浅色'
                    selected={!resolvedDark}
                    testId='navigator-user-theme-light'
                    onSelect={() => setPreference('light')}
                  />
                  <ThemeSegment
                    label='深色'
                    selected={resolvedDark}
                    testId='navigator-user-theme-dark'
                    onSelect={() => setPreference('dark')}
                  />
                </div>
              </div>

              <AccountMenuItem
                testId='navigator-user-help'
                icon={HelpCircleIcon}
                label='帮助与反馈'
                onClick={() =>
                  setNotice('帮助与反馈尚未接入：本地模板没有反馈通道')
                }
              />
              <AccountMenuItem
                testId='navigator-user-updates'
                icon={UpdateCircleIcon}
                label='检查更新'
                onClick={() =>
                  setNotice('检查更新尚未接入：当前桌面宿主没有安装器')
                }
              />
            </DropdownMenuGroup>

            <DropdownMenuSeparator className='mx-1 my-1.5 bg-black/8 dark:bg-white/10' />

            <DropdownMenuGroup>
              <AccountMenuItem
                testId='navigator-user-sign-out'
                icon={SignOutIcon}
                label='退出登录'
                onClick={() =>
                  setNotice('退出登录（静态 fixture）：无真实鉴权会话')
                }
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type='button'
          className={footerIconBtnClass}
          tabIndex={tabIndex}
          disabled={!interactive}
          data-testid='navigator-user-notifications'
          aria-label='通知'
          title='通知尚未接入'
          onClick={() => setNotice('通知尚未接入：本地模板没有消息中心')}
        >
          <BellIcon className='size-4' />
        </button>
      </div>

      <p
        id={noticeId}
        className='sr-only'
        data-testid='navigator-user-notice'
        role='status'
        aria-live='polite'
      >
        {notice ?? ''}
      </p>
    </div>
  )
}

interface AccountMenuItemProps {
  testId: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  onClick: () => void
}

function AccountMenuItem({ testId, icon: Icon, label, onClick }: AccountMenuItemProps) {
  return (
    <DropdownMenuItem
      data-testid={testId}
      className={menuItemClass}
      onClick={onClick}
    >
      <Icon />
      <span className='flex-1'>{label}</span>
    </DropdownMenuItem>
  )
}

interface ThemeSegmentProps {
  label: string
  selected: boolean
  testId: string
  onSelect: () => void
}

function ThemeSegment({ label, selected, testId, onSelect }: ThemeSegmentProps) {
  return (
    <button
      type='button'
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      className={cn(
        'h-6 rounded-md px-2 text-[12px] leading-none outline-none',
        selected
          ? 'bg-white text-black shadow-sm dark:bg-white/15 dark:text-white'
          : 'text-black/50 hover:text-black/80 dark:text-white/45 dark:hover:text-white/75',
      )}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {label}
    </button>
  )
}

function UserAvatar({ user }: { user: NavigatorUser }) {
  return (
    <span
      className='flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ebebeb] text-[13px] font-medium leading-8 text-black/70 dark:bg-white/10 dark:text-white/70'
      aria-hidden
      data-slot='navigator-user-avatar'
    >
      {user.initials}
    </span>
  )
}
