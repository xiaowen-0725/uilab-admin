import { Outlet } from "@tanstack/react-router"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { usePreferences } from "@/context/preferences-provider"
import { cn } from "@/lib/utils"

export function AuthenticatedLayout() {
  const { sidebarOpen, setSidebarOpen } = usePreferences()

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset
        className={cn(
          "@container/content",
          "has-data-[layout=fixed]:h-svh",
          "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]"
        )}
      >
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
