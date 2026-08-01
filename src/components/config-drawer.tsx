import { type SVGProps } from 'react'
import { CircleCheck, Copy, RotateCcw, Settings } from 'lucide-react'
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
  preferencesToAgentPrompt,
  preferencesToConfigSnippet,
  preferencesToJson,
  type AdminPreferences,
} from '@/config/admin-preferences'
import { useDirection } from '@/context/direction-provider'
import { type Collapsible, useLayout } from '@/context/layout-provider'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
    setOpen(true)
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
            aria-label='Open theme settings'
            className='rounded-full'
          />
        }
      >
        <Settings aria-hidden='true' />
      </SheetTrigger>
      <SheetContent className='flex flex-col'>
        <SheetHeader className='pb-0 text-start'>
          <SheetTitle>Theme Settings</SheetTitle>
          <SheetDescription>
            Adjust the appearance and layout to suit your preferences.
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-6 overflow-y-auto px-4'>
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
            aria-label='Reset all settings to default values'
          >
            Reset
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
  className,
}: {
  title: string
  showReset?: boolean
  onReset?: () => void
  resetAriaLabel?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground',
        className
      )}
    >
      {title}
      {showReset && onReset && (
        <Button
          type='button'
          size='icon'
          variant='secondary'
          className='size-4 rounded-full'
          onClick={onReset}
          aria-label={resetAriaLabel}
        >
          <RotateCcw className='size-3' />
        </Button>
      )}
    </div>
  )
}

function ConfigRadioItem({
  item,
  isTheme = false,
}: {
  item: {
    value: string
    label: string
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement
  }
  isTheme?: boolean
}) {
  return (
    <RadioGroupItem
      value={item.value}
      className={cn(
        'group flex !size-auto h-auto w-full flex-col items-center rounded-none border-0 bg-transparent p-0 text-current shadow-none ring-0 outline-none after:hidden',
        'data-checked:border-transparent data-checked:bg-transparent data-checked:text-current dark:data-checked:bg-transparent',
        '[&_[data-slot=radio-group-indicator]]:hidden',
        'transition duration-200 ease-in'
      )}
      aria-label={`Select ${item.label.toLowerCase()}`}
      aria-describedby={`${item.value}-description`}
    >
      <div
        className={cn(
          'relative rounded-[6px] ring-[1px] ring-border',
          'group-data-checked:shadow-2xl group-data-checked:ring-primary',
          'group-focus-visible:ring-2'
        )}
        role='img'
        aria-label={`${item.label} option preview`}
      >
        <CircleCheck
          className={cn(
            'size-6 fill-primary stroke-white',
            'group-data-unchecked:hidden',
            'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'
          )}
          aria-hidden='true'
        />
        <item.icon
          className={cn(
            !isTheme &&
              'fill-primary stroke-primary group-data-unchecked:fill-muted-foreground group-data-unchecked:stroke-muted-foreground'
          )}
          aria-hidden='true'
        />
      </div>
      <div
        className='mt-1 w-full text-center text-xs'
        id={`${item.value}-description`}
        aria-live='polite'
      >
        {item.label}
      </div>
    </RadioGroupItem>
  )
}

function ThemeConfig() {
  const { defaultTheme, theme, setTheme } = useTheme()
  return (
    <div>
      <SectionTitle
        title='Theme'
        showReset={theme !== defaultTheme}
        onReset={() => setTheme(defaultTheme)}
        resetAriaLabel='Reset theme preference to default'
      />
      <RadioGroup
        value={theme}
        onValueChange={setTheme}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label='Select theme preference'
      >
        {[
          { value: 'system', label: 'System', icon: IconThemeSystem },
          { value: 'light', label: 'Light', icon: IconThemeLight },
          { value: 'dark', label: 'Dark', icon: IconThemeDark },
        ].map((item) => (
          <ConfigRadioItem key={item.value} item={item} isTheme />
        ))}
      </RadioGroup>
    </div>
  )
}

function SidebarConfig() {
  const { defaultVariant, variant, setVariant } = useLayout()
  return (
    <div className='max-md:hidden'>
      <SectionTitle
        title='Sidebar'
        showReset={defaultVariant !== variant}
        onReset={() => setVariant(defaultVariant)}
        resetAriaLabel='Reset sidebar style to default'
      />
      <RadioGroup
        value={variant}
        onValueChange={setVariant}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label='Select sidebar style'
      >
        {[
          { value: 'inset', label: 'Inset', icon: IconSidebarInset },
          { value: 'floating', label: 'Floating', icon: IconSidebarFloating },
          { value: 'sidebar', label: 'Sidebar', icon: IconSidebarSidebar },
        ].map((item) => (
          <ConfigRadioItem key={item.value} item={item} />
        ))}
      </RadioGroup>
    </div>
  )
}

function LayoutConfig() {
  const { open, setOpen } = useSidebar()
  const { defaultCollapsible, collapsible, setCollapsible } = useLayout()
  const radioState = open ? 'default' : collapsible

  return (
    <div className='max-md:hidden'>
      <SectionTitle
        title='Layout'
        showReset={radioState !== 'default'}
        onReset={() => {
          setOpen(true)
          setCollapsible(defaultCollapsible)
        }}
        resetAriaLabel='Reset layout options to default'
      />
      <RadioGroup
        value={radioState}
        onValueChange={(v) => {
          if (v === 'default') {
            setOpen(true)
            return
          }
          setOpen(false)
          setCollapsible(v as Collapsible)
        }}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label='Select layout style'
      >
        {[
          { value: 'default', label: 'Default', icon: IconLayoutDefault },
          { value: 'icon', label: 'Compact', icon: IconLayoutCompact },
          { value: 'offcanvas', label: 'Full layout', icon: IconLayoutFull },
        ].map((item) => (
          <ConfigRadioItem key={item.value} item={item} />
        ))}
      </RadioGroup>
    </div>
  )
}

function DirConfig() {
  const { defaultDir, dir, setDir } = useDirection()
  return (
    <div>
      <SectionTitle
        title='Direction'
        showReset={defaultDir !== dir}
        onReset={() => setDir(defaultDir)}
        resetAriaLabel='Reset text direction to default'
      />
      <RadioGroup
        value={dir}
        onValueChange={setDir}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label='Select site direction'
      >
        {[
          {
            value: 'ltr',
            label: 'Left to Right',
            icon: (props: SVGProps<SVGSVGElement>) => (
              <IconDir dir='ltr' {...props} />
            ),
          },
          {
            value: 'rtl',
            label: 'Right to Left',
            icon: (props: SVGProps<SVGSVGElement>) => (
              <IconDir dir='rtl' {...props} />
            ),
          },
        ].map((item) => (
          <ConfigRadioItem key={item.value} item={item} />
        ))}
      </RadioGroup>
    </div>
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
    <div className='space-y-3 rounded-xl border bg-muted/30 p-3'>
      <div className='space-y-1'>
        <div className='text-sm font-semibold'>Export as project defaults</div>
        <p className='text-xs text-muted-foreground'>
          Runtime tweaks stay in cookies. Copy these values into
          `src/config/admin-preferences.ts` for a new app default.
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
          Copy JSON
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
          Copy defaults code
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
          Copy agent prompt
        </Button>
      </div>
      <pre className='overflow-x-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground'>
        {preferencesToJson(preferences)}
      </pre>
    </div>
  )
}
