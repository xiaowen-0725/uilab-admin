import * as React from "react"
import {
  Check,
  Columns2,
  Copy,
  LayoutDashboard,
  LayoutTemplate,
  Monitor,
  Moon,
  PanelLeft,
  RotateCcw,
  Settings2,
  Square,
  Sun,
} from "lucide-react"
import { toast } from "sonner"
import {
  preferencesToAgentPrompt,
  preferencesToConfigSnippet,
  preferencesToJson,
  type AdminPreferences,
  type LayoutMode,
  type SidebarVariant,
  type AdminTheme,
  type TextDirection,
} from "@/config/admin-preferences"
import { usePreferences } from "@/context/preferences-provider"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type OptionCardProps<T extends string> = {
  value: T
  current: T
  label: string
  description?: string
  icon: React.ReactNode
  onSelect: (value: T) => void
}

function OptionCard<T extends string>({
  value,
  current,
  label,
  description,
  icon,
  onSelect,
}: OptionCardProps<T>) {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background"
      )}
      aria-pressed={selected}
    >
      {selected ? (
        <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="size-3" />
        </span>
      ) : null}
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
        {icon}
      </div>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </button>
  )
}

function SectionTitle({
  title,
  showReset,
  onReset,
}: {
  title: string
  showReset?: boolean
  onReset?: () => void
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <span>{title}</span>
      {showReset && onReset ? (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          className="rounded-full"
          onClick={onReset}
          aria-label={`重置${title}`}
        >
          <RotateCcw className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error("复制失败，请手动选择文本")
  }
}

export function ConfigDrawer() {
  const {
    defaults,
    preferences,
    setThemePreference,
    setSidebarVariant,
    setLayoutMode,
    setDirection,
    resetPreferences,
    setSidebarOpen,
  } = usePreferences()

  const handleLayoutSelect = (layout: LayoutMode) => {
    setLayoutMode(layout)
    setSidebarOpen(layout === "default")
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            aria-label="打开外观与布局设置"
            className="rounded-full"
          />
        }
      >
        <Settings2 className="size-4" />
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="pb-0 text-start">
          <SheetTitle>外观与布局</SheetTitle>
          <SheetDescription>
            调整当前浏览器的主题与壳层布局。可导出为项目默认配置，供新应用复用。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-2">
          <section>
            <SectionTitle
              title="主题"
              showReset={preferences.theme !== defaults.theme}
              onReset={() => setThemePreference(defaults.theme)}
            />
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    value: "system",
                    label: "跟随系统",
                    icon: <Monitor className="size-4" />,
                  },
                  {
                    value: "light",
                    label: "浅色",
                    icon: <Sun className="size-4" />,
                  },
                  {
                    value: "dark",
                    label: "深色",
                    icon: <Moon className="size-4" />,
                  },
                ] satisfies Array<{
                  value: AdminTheme
                  label: string
                  icon: React.ReactNode
                }>
              ).map((item) => (
                <OptionCard
                  key={item.value}
                  value={item.value}
                  current={preferences.theme}
                  label={item.label}
                  icon={item.icon}
                  onSelect={setThemePreference}
                />
              ))}
            </div>
          </section>

          <section className="max-md:hidden">
            <SectionTitle
              title="侧栏样式"
              showReset={preferences.sidebar !== defaults.sidebar}
              onReset={() => setSidebarVariant(defaults.sidebar)}
            />
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    value: "inset",
                    label: "内嵌",
                    description: "Inset",
                    icon: <Square className="size-4" />,
                  },
                  {
                    value: "floating",
                    label: "浮动",
                    description: "Floating",
                    icon: <Columns2 className="size-4" />,
                  },
                  {
                    value: "sidebar",
                    label: "贴边",
                    description: "Sidebar",
                    icon: <PanelLeft className="size-4" />,
                  },
                ] satisfies Array<{
                  value: SidebarVariant
                  label: string
                  description: string
                  icon: React.ReactNode
                }>
              ).map((item) => (
                <OptionCard
                  key={item.value}
                  value={item.value}
                  current={preferences.sidebar}
                  label={item.label}
                  description={item.description}
                  icon={item.icon}
                  onSelect={setSidebarVariant}
                />
              ))}
            </div>
          </section>

          <section className="max-md:hidden">
            <SectionTitle
              title="布局密度"
              showReset={preferences.layout !== defaults.layout}
              onReset={() => handleLayoutSelect(defaults.layout)}
            />
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    value: "default",
                    label: "默认",
                    description: "展开侧栏",
                    icon: <LayoutDashboard className="size-4" />,
                  },
                  {
                    value: "compact",
                    label: "紧凑",
                    description: "图标侧栏",
                    icon: <LayoutTemplate className="size-4" />,
                  },
                  {
                    value: "full",
                    label: "全宽",
                    description: "隐藏侧栏",
                    icon: <Columns2 className="size-4" />,
                  },
                ] satisfies Array<{
                  value: LayoutMode
                  label: string
                  description: string
                  icon: React.ReactNode
                }>
              ).map((item) => (
                <OptionCard
                  key={item.value}
                  value={item.value}
                  current={preferences.layout}
                  label={item.label}
                  description={item.description}
                  icon={item.icon}
                  onSelect={handleLayoutSelect}
                />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle
              title="阅读方向"
              showReset={preferences.direction !== defaults.direction}
              onReset={() => setDirection(defaults.direction)}
            />
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    value: "ltr",
                    label: "从左到右",
                    description: "LTR",
                    icon: <PanelLeft className="size-4" />,
                  },
                  {
                    value: "rtl",
                    label: "从右到左",
                    description: "RTL",
                    icon: <Columns2 className="size-4" />,
                  },
                ] satisfies Array<{
                  value: TextDirection
                  label: string
                  description: string
                  icon: React.ReactNode
                }>
              ).map((item) => (
                <OptionCard
                  key={item.value}
                  value={item.value}
                  current={preferences.direction}
                  label={item.label}
                  description={item.description}
                  icon={item.icon}
                  onSelect={setDirection}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-muted/30 p-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold">导出为项目默认</div>
              <p className="text-xs text-muted-foreground">
                当前选择只影响本浏览器。复制后可固化到
                `src/config/admin-preferences.ts`，供新应用默认使用。
              </p>
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() =>
                  copyText(
                    preferencesToJson(preferences),
                    "已复制 JSON 配置"
                  )
                }
              >
                <Copy className="size-4" />
                复制 JSON
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() =>
                  copyText(
                    preferencesToConfigSnippet(preferences),
                    "已复制配置代码片段"
                  )
                }
              >
                <Copy className="size-4" />
                复制 defaults 代码
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() =>
                  copyText(
                    preferencesToAgentPrompt(preferences),
                    "已复制 Agent 提示词"
                  )
                }
              >
                <Copy className="size-4" />
                复制 Agent 提示词
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
              {preferencesToJson(preferences)}
            </pre>
          </section>
        </div>

        <SheetFooter className="gap-2 sm:flex-col">
          <Button
            variant="destructive"
            onClick={() => {
              resetPreferences()
              setSidebarOpen(true)
              toast.message("已恢复项目默认布局")
            }}
          >
            <RotateCcw className="size-4" />
            重置为项目默认
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// keep type export surface stable for future CLI/skill adapters
export type { AdminPreferences }
