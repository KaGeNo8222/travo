import { lazy, Suspense } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage, RouteError } from '@/components/layout/ErrorStates'
import { PageLoader } from '@/components/ui/Primitives'
import { BookingsPage } from '@/pages/BookingsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { ItineraryPage } from '@/pages/ItineraryPage'
import { MorePage } from '@/pages/MorePage'
import { PlacesPage } from '@/pages/PlacesPage'
import { ShoppingPage } from '@/pages/ShoppingPage'
import { TripsPage } from '@/pages/TripsPage'
import { RootRedirect, TripLayout } from './TripLayout'

// Settings (backup, restore, storage tools) is rarely opened; load it on demand.
// The service worker precaches the chunk, so it still works offline.
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'trips', element: <TripsPage /> },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'trip/:tripId',
        element: <TripLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'plan', element: <ItineraryPage /> },
          { path: 'places', element: <PlacesPage /> },
          { path: 'shopping', element: <ShoppingPage /> },
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'more', element: <MorePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})
