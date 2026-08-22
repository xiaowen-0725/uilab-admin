import { useEffect, useId, useState } from 'react'
import { ChevronsUpDown, LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    if (!interactive) {
      setMenuOpen(false)
      setNotice(null)
    }
  }, [interactive])

  return (
    <div
      className='relative shrink-0 px-2 pb-2 pt-1'
      data-slot='navigator-user-menu'
      data-testid='navigator-user-menu'
      data-open={menuOpen ? 'true' : 'false'}
    >
      <DropdownMenu
        open={interactive ? menuOpen : false}
        onOpenChange={(open) => {
          if (!interactive) return
          setMenuOpen(open)
          if (open) setNotice(null)
        }}
      >
        <DropdownMenuTrigger
          disabled={!interactive}
          render={
            <button
              type='button'
              data-testid='navigator-user-trigger'
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left',
                'hover:bg-black/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/[0.05]',
                'data-[popup-open]:bg-black/[0.05] data-[open]:bg-black/[0.05] dark:data-[popup-open]:bg-white/[0.10] dark:data-[open]:bg-white/[0.10]'
              )}
              aria-label={`账户：${user.name}`}
              title='账户菜单'
              tabIndex={tabIndex}
            />
          }
        >
          <UserAvatar user={user} />
          <div className='min-w-0 flex-1'>
            <span className='block truncate text-[14px] font-normal leading-5 text-black/90 dark:text-white/84'>
              {user.name}
            </span>
            <span className='block truncate text-[12px] leading-[18px] text-black/45 dark:text-white/42'>
              {user.email}
            </span>
          </div>
          <ChevronsUpDown
            className='size-4 shrink-0 text-muted-foreground'
            aria-hidden
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side='top'
          align='start'
          sideOffset={8}
          data-testid='navigator-user-menu-panel'
          className='w-(--anchor-width) min-w-56 rounded-xl p-0'
          aria-label='账户菜单'
        >
          <div className='flex items-center gap-2.5 px-3 py-2.5'>
            <UserAvatar user={user} />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium leading-tight'>
                {user.name}
              </p>
              <p className='truncate text-xs text-muted-foreground'>
                {user.email}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator className='my-0' />
          <DropdownMenuGroup className='p-1'>
            <DropdownMenuItem
              data-testid='navigator-user-settings'
              className='rounded-lg px-2.5 py-2'
              onClick={() => {
                setNotice(null)
                onOpenSettings?.()
              }}
            >
              <Settings className='text-muted-foreground' aria-hidden />
              <span className='flex-1'>设置</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant='destructive'
              data-testid='navigator-user-sign-out'
              className='rounded-lg px-2.5 py-2'
              onClick={() =>
                setNotice('退出登录（静态 fixture）：无真实鉴权会话')
              }
            >
              <LogOut aria-hidden />
              <span className='flex-1'>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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

function UserAvatar({ user }: { user: NavigatorUser }) {
  return (
    <span
      className='flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'
      aria-hidden
      data-slot='navigator-user-avatar'
    >
      {user.initials}
    </span>
  )
}
