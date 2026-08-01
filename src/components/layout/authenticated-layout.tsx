import { Outlet } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { cn } from "@/lib/utils"

export function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className={cn("@container/content")}>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
