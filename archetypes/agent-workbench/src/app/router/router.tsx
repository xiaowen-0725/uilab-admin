import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { WorkbenchApp } from '../composition/workbench-app'
import { QuestionCardPrototypePage } from '@/modules/task/ui/timeline/question-card.prototype'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WorkbenchApp,
})

// PROTOTYPE — throwaway route for #108 question card variants (DEV only).
const prototypeQuestionCardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototype/question-card',
  component: function PrototypeQuestionCardRoute() {
    if (!import.meta.env.DEV) return null
    return <QuestionCardPrototypePage />
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  prototypeQuestionCardRoute,
])

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
