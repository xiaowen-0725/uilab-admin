import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '../providers/app-providers'
import { AppRouter } from '../router/router'
import '@/styles/index.css'

export function mountWorkbench(rootElement: HTMLElement) {
  if (rootElement.innerHTML) return

  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </StrictMode>
  )
}
