import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { adminPreferenceDefaults } from "@/config/admin-preferences"
import { PreferencesProvider } from "@/context/preferences-provider"
import { routeTree } from "./routeTree.gen"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")!

if (!rootElement.innerHTML) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme={adminPreferenceDefaults.theme} storageKey="uilab-admin-theme">
          <PreferencesProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
              <Toaster richColors position="top-right" />
            </TooltipProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
