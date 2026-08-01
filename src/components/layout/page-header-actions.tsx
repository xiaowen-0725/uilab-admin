import { ConfigDrawer } from "@/components/config-drawer"
import { ThemeSwitch } from "@/components/theme-switch"

export function PageHeaderActions() {
  return (
    <div className="ms-auto flex items-center gap-1">
      <ThemeSwitch />
      <ConfigDrawer />
    </div>
  )
}
