import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ChevronsUpDown, LogOut, Settings } from 'lucide-react'

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
 * Account chip at the Navigator foot.
 * Menu opens upward; Settings opens the Shell dialog; Sign-out stays fixture-only.
 */
export function NavigatorUserMenu({
  user = DEMO_NAVIGATOR_USER,
  interactive,
  onOpenSettings,
}: NavigatorUserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const noticeId = useId()

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  // Close when Navigator becomes non-interactive (collapsed / overlay closed).
  useEffect(() => {
    if (!interactive) {
      setMenuOpen(false)
      setNotice(null)
    }
  }, [interactive])

  // Outside click + Escape.
  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) return
      if (event.target instanceof Node && !root.contains(event.target)) {
        closeMenu()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMenu()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen, closeMenu])

  const runFixtureAction = useCallback(
    (message: string) => {
      setNotice(message)
      setMenuOpen(false)
      // Return focus to the account chip after a menu action.
      requestAnimationFrame(() => triggerRef.current?.focus())
    },
    []
  )

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setMenuOpen(true)
      setNotice(null)
    }
  }

  const tabIndex = interactive ? 0 : -1

  return (
    <div
      ref={rootRef}
      className='relative shrink-0 px-2 pb-2 pt-1'
      data-slot='navigator-user-menu'
      data-testid='navigator-user-menu'
      data-open={menuOpen ? 'true' : 'false'}
    >
      {menuOpen ? (
        <div
          id={menuId}
          role='menu'
          aria-label='账户菜单'
          data-testid='navigator-user-menu-panel'
          className='absolute inset-x-2 bottom-full z-50 mb-1 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_12px_40px_color-mix(in_oklch,var(--foreground)_14%,transparent)]'
        >
          <div className='flex items-center gap-2.5 border-b border-border px-3 py-2.5'>
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

          <div className='p-1'>
            <button
              type='button'
              role='menuitem'
              data-testid='navigator-user-settings'
              tabIndex={tabIndex}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none'
              onClick={() => {
                setMenuOpen(false)
                setNotice(null)
                onOpenSettings?.()
              }}
            >
              <Settings className='size-4 shrink-0 text-muted-foreground' aria-hidden />
              <span className='flex-1'>设置</span>
            </button>
            <button
              type='button'
              role='menuitem'
              data-testid='navigator-user-sign-out'
              tabIndex={tabIndex}
              className='flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none'
              onClick={() =>
                runFixtureAction(
                  '退出登录（静态 fixture）：无真实鉴权会话'
                )
              }
            >
              <LogOut className='size-4 shrink-0' aria-hidden />
              <span className='flex-1'>退出登录</span>
            </button>
          </div>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type='button'
        data-testid='navigator-user-trigger'
        className='flex w-full items-center gap-2 rounded-xl bg-sidebar-accent/50 px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-[open=true]:bg-sidebar-accent'
        aria-haspopup='menu'
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={`账户：${user.name}`}
        title='账户菜单'
        tabIndex={tabIndex}
        data-open={menuOpen ? 'true' : 'false'}
        onClick={() => {
          if (!interactive) return
          setMenuOpen((value) => !value)
          setNotice(null)
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <UserAvatar user={user} />
        <div className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-medium leading-tight'>
            {user.name}
          </span>
          <span className='block truncate text-xs text-muted-foreground'>
            {user.email}
          </span>
        </div>
        <ChevronsUpDown
          className='size-4 shrink-0 text-muted-foreground'
          aria-hidden
        />
      </button>

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
