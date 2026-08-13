import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { WorkbenchApp } from '../composition/workbench-app'
import { PlanPanelPrototypePage } from '../prototype/plan-panel-prototype'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WorkbenchApp,
})

// PROTOTYPE — throwaway route for issue #96 (dev only); remove after review.
const planPanelPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototype/plan-panel',
  component: PlanPanelPrototypePage,
})

const routeTree = rootRoute.addChildren(
  import.meta.env.DEV ? [indexRoute, planPanelPrototypeRoute] : [indexRoute],
)

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />
}
