import { clearCookies } from '@/test-utils/cookies'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  adminPreferenceDefaults,
  defaultSidebarOpen,
} from '@/config/admin-preferences'
import { getCookie, setCookie } from '@/lib/cookies'
import { DirectionProvider } from '@/context/direction-provider'
import { LayoutProvider } from '@/context/layout-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ConfigDrawer } from './config-drawer'

/** Project-default collapsible mode (mirrors layout-provider). */
const defaultCollapsible =
  adminPreferenceDefaults.layout === 'full' ? 'offcanvas' : 'icon'

async function renderConfigDrawer({
  sidebarDefaultOpen = defaultSidebarOpen,
}: {
  sidebarDefaultOpen?: boolean
} = {}) {
  return await render(
    <DirectionProvider>
      <ThemeProvider>
        <LayoutProvider>
          <SidebarProvider defaultOpen={sidebarDefaultOpen}>
            <ConfigDrawer />
          </SidebarProvider>
        </LayoutProvider>
      </ThemeProvider>
    </DirectionProvider>
  )
}

async function openDrawer(screen: RenderResult) {
  await userEvent.click(
    screen.getByRole('button', { name: /^打开外观与布局设置$/ })
  )
  await expect.element(screen.getByText(/^外观与布局$/)).toBeInTheDocument()
}

describe('ConfigDrawer (integration)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    clearCookies()

    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.removeAttribute('dir')

    // Sidebar/layout sections use max-md:hidden; need desktop width.
    await page.viewport(1280, 800)
  })

  it('opens the drawer and renders the sections', async () => {
    const screen = await renderConfigDrawer()

    await openDrawer(screen)

    const drawer = screen.getByRole('dialog', { name: /外观与布局/ })

    await expect.element(drawer).toBeInTheDocument()

    await expect.element(drawer.getByText(/^主题$/)).toBeInTheDocument()
    await expect.element(drawer.getByText(/^布局密度$/)).toBeInTheDocument()
    await expect
      .element(drawer.getByText(/^侧栏样式$/).first())
      .toBeInTheDocument()
    await expect.element(drawer.getByText(/^阅读方向$/)).toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('button', {
          name: /重置所有设置为默认值/,
        })
      )
      .toBeInTheDocument()
  })

  describe('theme preference', () => {
    it('applies light theme to <html> and cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)
      await userEvent.click(
        screen.getByRole('button', { name: /^选择浅色$/ })
      )
      await vi.waitFor(() =>
        expect(document.documentElement.classList.contains('light')).toBe(true)
      )
      expect(getCookie('vite-ui-theme')).toBe('light')
    })

    it('applies dark theme to <html> and cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)
      await userEvent.click(screen.getByRole('button', { name: /^选择深色$/ }))
      await vi.waitFor(() =>
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      )
      expect(getCookie('vite-ui-theme')).toBe('dark')
    })

    it('applies system theme: stores cookie and applies a resolved light or dark class', async () => {
      // Pre-seed light so mounted theme is not system; re-selecting System alone would not fire setTheme.
      setCookie('vite-ui-theme', 'light')

      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择跟随系统$/ })
      )
      await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('system'))
      await vi.waitFor(() => {
        const root = document.documentElement
        const hasLight = root.classList.contains('light')
        const hasDark = root.classList.contains('dark')
        expect(hasLight !== hasDark).toBe(true)
      })
    })
  })

  describe('sidebar variant', () => {
    it('selecting floating updates layout_variant cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择浮动$/ })
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_variant')).toBe('floating')
      )
    })

    it('selecting sidebar updates layout_variant cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择贴边$/ })
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_variant')).toBe('sidebar')
      )
    })

    it('selecting inset updates layout_variant cookie after another variant', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择浮动$/ })
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_variant')).toBe('floating')
      )

      await userEvent.click(
        screen.getByRole('button', { name: /^选择内嵌$/ })
      )
      await vi.waitFor(() => expect(getCookie('layout_variant')).toBe('inset'))
    })
  })

  it('selecting full layout sets collapsible to offcanvas and closes sidebar', async () => {
    // Force open so selecting full is a real user change from an open state.
    const screen = await renderConfigDrawer({ sidebarDefaultOpen: true })
    await openDrawer(screen)

    await userEvent.click(
      screen.getByRole('button', { name: /^选择全宽$/ })
    )
    await vi.waitFor(() =>
      expect(getCookie('layout_collapsible')).toBe('offcanvas')
    )
    await vi.waitFor(() => expect(getCookie('sidebar_state')).toBe('false'))
  })

  describe('section reset buttons', () => {
    it('resets theme via section control after choosing dark', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(screen.getByRole('button', { name: /^选择深色$/ }))
      await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('dark'))

      await userEvent.click(
        screen.getByRole('button', {
          name: /重置主题为默认/,
        })
      )
      // Section reset uses setTheme(defaultTheme), which writes the project default cookie.
      await vi.waitFor(() =>
        expect(getCookie('vite-ui-theme')).toBe(adminPreferenceDefaults.theme)
      )
    })

    it('resets direction via section control after choosing RTL', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择从右到左$/ })
      )
      await vi.waitFor(() =>
        expect(document.documentElement.getAttribute('dir')).toBe('rtl')
      )

      await userEvent.click(
        screen.getByRole('button', {
          name: /重置阅读方向为默认/,
        })
      )
      await vi.waitFor(() =>
        expect(document.documentElement.getAttribute('dir')).toBe(
          adminPreferenceDefaults.direction
        )
      )
      // Section reset uses setDir(defaultDir), which writes the project default cookie.
      expect(getCookie('dir')).toBe(adminPreferenceDefaults.direction)
    })

    it('resets sidebar style via section control after choosing floating', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('button', { name: /^选择浮动$/ })
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_variant')).toBe('floating')
      )

      await userEvent.click(
        screen.getByRole('button', {
          name: /重置侧栏样式为默认/,
        })
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_variant')).toBe(
          adminPreferenceDefaults.sidebar
        )
      )
    })

    it('resets layout via section control after diverging from project default', async () => {
      const screen = await renderConfigDrawer({
        sidebarDefaultOpen: defaultSidebarOpen,
      })
      await openDrawer(screen)

      // Diverge from project default density so the section reset control appears.
      if (defaultSidebarOpen) {
        await userEvent.click(
          screen.getByRole('button', { name: /^选择紧凑$/ })
        )
        await vi.waitFor(() =>
          expect(getCookie('sidebar_state')).toBe('false')
        )
      } else if (adminPreferenceDefaults.layout === 'compact') {
        await userEvent.click(
          screen.getByRole('button', { name: /^选择全宽$/ })
        )
        await vi.waitFor(() =>
          expect(getCookie('layout_collapsible')).toBe('offcanvas')
        )
      } else {
        // project default is full
        await userEvent.click(
          screen.getByRole('button', { name: /^选择紧凑$/ })
        )
        await vi.waitFor(() =>
          expect(getCookie('layout_collapsible')).toBe('icon')
        )
      }

      await userEvent.click(
        screen.getByRole('button', {
          name: /重置布局为默认/,
        })
      )
      await vi.waitFor(() =>
        expect(getCookie('sidebar_state')).toBe(String(defaultSidebarOpen))
      )
      await vi.waitFor(() =>
        expect(getCookie('layout_collapsible')).toBe(defaultCollapsible)
      )
    })
  })

  it('changes direction and applies it to <html dir>', async () => {
    const screen = await renderConfigDrawer()

    await openDrawer(screen)

    await userEvent.click(
      screen.getByRole('button', { name: /^选择从右到左$/ })
    )
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    )
    expect(getCookie('dir')).toBe('rtl')
  })

  it('updates layout: selecting non-default closes sidebar and changes layout cookie', async () => {
    // Force open so selecting compact is a deliberate user change.
    const screen = await renderConfigDrawer({ sidebarDefaultOpen: true })

    await openDrawer(screen)

    await expect
      .element(screen.getByRole('button', { name: /^选择默认$/ }))
      .toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(
      screen.getByRole('button', { name: /^选择紧凑$/ })
    )

    await vi.waitFor(() => expect(getCookie('sidebar_state')).toBe('false'))
    await vi.waitFor(() => expect(getCookie('layout_collapsible')).toBe('icon'))
  })

  it('reset restores defaults across sidebar/theme/layout/direction', async () => {
    const screen = await renderConfigDrawer({
      sidebarDefaultOpen: defaultSidebarOpen,
    })

    await openDrawer(screen)

    await userEvent.click(screen.getByRole('button', { name: /^选择深色$/ }))
    await userEvent.click(
      screen.getByRole('button', { name: /^选择从右到左$/ })
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^选择浮动$/ })
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^选择全宽$/ })
    )

    await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('dark'))
    await vi.waitFor(() => expect(getCookie('dir')).toBe('rtl'))
    await vi.waitFor(() => expect(getCookie('layout_variant')).toBe('floating'))
    await vi.waitFor(() =>
      expect(getCookie('layout_collapsible')).toBe('offcanvas')
    )

    await userEvent.click(
      screen.getByRole('button', {
        name: /重置所有设置为默认值/,
      })
    )

    await vi.waitFor(() =>
      expect(getCookie('sidebar_state')).toBe(String(defaultSidebarOpen))
    )
    await vi.waitFor(() => expect(getCookie('dir')).toBeUndefined())
    await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBeUndefined())
    await vi.waitFor(() =>
      expect(getCookie('layout_variant')).toBe(adminPreferenceDefaults.sidebar)
    )
    await vi.waitFor(() =>
      expect(getCookie('layout_collapsible')).toBe(defaultCollapsible)
    )
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('dir')).toBe(
        adminPreferenceDefaults.direction
      )
    )
  })
})
