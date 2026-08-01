import { type SVGProps } from 'react'
import { Check, Copy, RotateCcw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { IconDir } from '@/assets/custom/icon-dir'
import { IconLayoutCompact } from '@/assets/custom/icon-layout-compact'
import { IconLayoutDefault } from '@/assets/custom/icon-layout-default'
import { IconLayoutFull } from '@/assets/custom/icon-layout-full'
import { IconSidebarFloating } from '@/assets/custom/icon-sidebar-floating'
import { IconSidebarInset } from '@/assets/custom/icon-sidebar-inset'
import { IconSidebarSidebar } from '@/assets/custom/icon-sidebar-sidebar'
import { IconThemeDark } from '@/assets/custom/icon-theme-dark'
import { IconThemeLight } from '@/assets/custom/icon-theme-light'
import { IconThemeSystem } from '@/assets/custom/icon-theme-system'
import {
  defaultSidebarOpen,
  preferencesToAgentPrompt,
  preferencesToConfigSnippet,
  preferencesToJson,
  type AdminPreferences,
} from '@/config/admin-preferences'
import { useDirection } from '@/context/direction-provider'
import { type Collapsible, useLayout } from '@/context/layout-provider'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function ConfigDrawer() {
  const { setOpen } = useSidebar()
  const { resetDir } = useDirection()
  const { resetTheme } = useTheme()
  const { resetLayout } = useLayout()

  const handleReset = () => {
    setOpen(defaultSidebarOpen)
    resetDir()
    resetTheme()
    resetLayout()
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            size='icon'
            variant='ghost'
            aria-label='打开外观与布局设置'
            className='rounded-full'
          />
        }
      >
        <Settings aria-hidden='true' />
      </SheetTrigger>
      <SheetContent className='flex w-full flex-col sm:max-w-md'>
        <SheetHeader className='pb-0 text-start'>
          <SheetTitle>外观与布局</SheetTitle>
          <SheetDescription>按偏好调整主题与壳层布局。</SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-6 overflow-y-auto px-4 py-2'>
          <ThemeConfig />
          <SidebarConfig />
          <LayoutConfig />
          <DirConfig />
          <ExportConfig />
        </div>

        <SheetFooter className='gap-2'>
          <Button
            variant='destructive'
            onClick={handleReset}
            aria-label='重置所有设置为默认值'
          >
            重置
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function SectionTitle({
  title,
  showReset = false,
  onReset,
  resetAriaLabel,
}: {
  title: string
  showReset?: boolean
  onReset?: () => void
  resetAriaLabel?: string
}) {
  return (
    <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
      <span>{title}</span>
      {showReset && onReset ? (
        <Button
          type='button'
          size='icon-xs'
          variant='secondary'
          className='rounded-full'
          onClick={onReset}
          aria-label={resetAriaLabel}
        >
          <RotateCcw className='size-3' />
        </Button>
      ) : null}
    </div>
  )
}

type OptionItem<T extends string> = {
  value: T
  label: string
  icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement
}

function OptionCard<T extends string>({
  item,
  current,
  onSelect,
  isTheme = false,
}: {
  item: OptionItem<T>
  current: T
  onSelect: (value: T) => void
  isTheme?: boolean
}) {
  const selected = item.value === current

  return (
    <button
      type='button'
      onClick={() => onSelect(item.value)}
      aria-pressed={selected}
      aria-label={`选择${item.label}`}
      className={cn(
        'group flex w-full flex-col items-center gap-1 rounded-lg p-0.5 text-center transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-[6px] ring-1 ring-border',
          selected && 'shadow-md ring-2 ring-primary'
        )}
      >
        {selected ? (
          <span className='absolute top-0 right-0 z-10 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary p-0.5 text-primary-foreground shadow-sm'>
            <Check className='size-3.5' strokeWidth={3} />
          </span>
        ) : null}
        <item.icon
          className={cn(
            'block h-auto w-full',
            isTheme
              ? 'overflow-hidden rounded-[6px]'
              : cn(
                  'fill-primary stroke-primary',
                  !selected &&
                    'fill-muted-foreground stroke-muted-foreground'
                )
          )}
          aria-hidden='true'
        />
      </div>
      <span className='text-xs text-foreground'>{item.label}</span>
    </button>
  )
}

function ThemeConfig() {
  const { defaultTheme, theme, setTheme } = useTheme()
  const items: OptionItem<'system' | 'light' | 'dark'>[] = [
    { value: 'system', label: '跟随系统', icon: IconThemeSystem },
    { value: 'light', label: '浅色', icon: IconThemeLight },
    { value: 'dark', label: '深色', icon: IconThemeDark },
  ]

  return (
    <section>
      <SectionTitle
        title='主题'
        showReset={theme !== defaultTheme}
        onReset={() => setTheme(defaultTheme)}
        resetAriaLabel='重置主题为默认'
      />
      <div className='grid grid-cols-3 gap-3'>
        {items.map((item) => (
          <OptionCard
            key={item.value}
            item={item}
            current={theme}
            onSelect={setTheme}
            isTheme
          />
        ))}
      </div>
    </section>
  )
}

function SidebarConfig() {
  const { defaultVariant, variant, setVariant } = useLayout()
  const items: OptionItem<'inset' | 'floating' | 'sidebar'>[] = [
    { value: 'inset', label: '内嵌', icon: IconSidebarInset },
    { value: 'floating', label: '浮动', icon: IconSidebarFloating },
    { value: 'sidebar', label: '贴边', icon: IconSidebarSidebar },
  ]

  return (
    <section className='max-md:hidden'>
      <SectionTitle
        title='侧栏样式'
        showReset={defaultVariant !== variant}
        onReset={() => setVariant(defaultVariant)}
        resetAriaLabel='重置侧栏样式为默认'
      />
      <div className='grid grid-cols-3 gap-3'>
        {items.map((item) => (
          <OptionCard
            key={item.value}
            item={item}
            current={variant}
            onSelect={setVariant}
          />
        ))}
      </div>
    </section>
  )
}

function LayoutConfig() {
  const { open, setOpen } = useSidebar()
  const { defaultCollapsible, collapsible, setCollapsible } = useLayout()
  const current = open ? 'default' : collapsible
  // Project default selection: open → "default"; closed → collapsible mode (icon/offcanvas).
  const projectDefaultCurrent = defaultSidebarOpen
    ? 'default'
    : defaultCollapsible

  const items: OptionItem<'default' | 'icon' | 'offcanvas'>[] = [
    { value: 'default', label: '默认', icon: IconLayoutDefault },
    { value: 'icon', label: '紧凑', icon: IconLayoutCompact },
    { value: 'offcanvas', label: '全宽', icon: IconLayoutFull },
  ]

  return (
    <section className='max-md:hidden'>
      <SectionTitle
        title='布局密度'
        showReset={current !== projectDefaultCurrent}
        onReset={() => {
          setOpen(defaultSidebarOpen)
          setCollapsible(defaultCollapsible)
        }}
        resetAriaLabel='重置布局为默认'
      />
      <div className='grid grid-cols-3 gap-3'>
        {items.map((item) => (
          <OptionCard
            key={item.value}
            item={item}
            current={current}
            onSelect={(value) => {
              if (value === 'default') {
                setOpen(true)
                return
              }
              setOpen(false)
              setCollapsible(value as Collapsible)
            }}
          />
        ))}
      </div>
    </section>
  )
}

function DirConfig() {
  const { defaultDir, dir, setDir } = useDirection()
  const items: OptionItem<'ltr' | 'rtl'>[] = [
    {
      value: 'ltr',
      label: '从左到右',
      icon: (props) => <IconDir dir='ltr' {...props} />,
    },
    {
      value: 'rtl',
      label: '从右到左',
      icon: (props) => <IconDir dir='rtl' {...props} />,
    },
  ]

  return (
    <section>
      <SectionTitle
        title='阅读方向'
        showReset={defaultDir !== dir}
        onReset={() => setDir(defaultDir)}
        resetAriaLabel='重置阅读方向为默认'
      />
      <div className='grid grid-cols-2 gap-3'>
        {items.map((item) => (
          <OptionCard
            key={item.value}
            item={item}
            current={dir}
            onSelect={setDir}
          />
        ))}
      </div>
    </section>
  )
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error('复制失败，请手动选择文本')
  }
}

function ExportConfig() {
  const { theme } = useTheme()
  const { variant, collapsible } = useLayout()
  const { open } = useSidebar()
  const { dir } = useDirection()

  const layout: AdminPreferences['layout'] = open
    ? 'default'
    : collapsible === 'offcanvas'
      ? 'full'
      : 'compact'

  const preferences: AdminPreferences = {
    theme,
    sidebar: variant,
    layout,
    direction: dir,
  }

  return (
    <section className='space-y-3 rounded-xl border bg-muted/30 p-3'>
      <div className='space-y-1'>
        <div className='text-sm font-semibold'>导出为项目默认</div>
        <p className='text-xs text-muted-foreground'>
          运行时偏好保存在 cookie。复制后可写入
          `src/config/admin-preferences.ts`，作为新应用默认。
        </p>
      </div>
      <div className='grid gap-2'>
        <Button
          variant='outline'
          className='justify-start'
          onClick={() =>
            copyText(preferencesToJson(preferences), '已复制 JSON 配置')
          }
        >
          <Copy className='size-4' />
          复制 JSON
        </Button>
        <Button
          variant='outline'
          className='justify-start'
          onClick={() =>
            copyText(
              preferencesToConfigSnippet(preferences),
              '已复制 defaults 代码'
            )
          }
        >
          <Copy className='size-4' />
          复制 defaults 代码
        </Button>
        <Button
          variant='outline'
          className='justify-start'
          onClick={() =>
            copyText(
              preferencesToAgentPrompt(preferences),
              '已复制 Agent 提示词'
            )
          }
        >
          <Copy className='size-4' />
          复制 Agent 提示词
        </Button>
      </div>
      <pre className='overflow-x-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground'>
        {preferencesToJson(preferences)}
      </pre>
    </section>
  )
}
