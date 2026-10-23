import { RouterProvider } from 'react-router/dom'
import { RootErrorBoundary } from '@/components/layout/ErrorStates'
import { AppProviders } from './providers/AppProviders'
import { router } from './router'

export function App() {
  return (
    <RootErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </RootErrorBoundary>
  )
}
