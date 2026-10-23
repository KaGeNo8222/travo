import { useEffect, useMemo } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { NotFoundPage } from '@/components/layout/ErrorStates'
import { PageLoader } from '@/components/ui/Primitives'
import { getSetting } from '@/db/repositories/settingsRepository'
import { useAppSettings, useTrip, useTripDays, useTripSettings } from '@/hooks/useData'
import { defaultTripSettings, setActiveTrip } from '@/services/tripService'
import { TripContext } from './providers/TripContext'

/** Loads the trip for /trip/:tripId/* and remembers it as the active trip. */
export function TripLayout() {
  const { tripId = '' } = useParams()
  const trip = useTrip(tripId)
  const days = useTripDays(tripId)
  const settings = useTripSettings(tripId)

  useEffect(() => {
    if (!trip) return
    void getSetting('activeTripId').then((active) => {
      if (active !== trip.id) void setActiveTrip(trip.id)
    })
  }, [trip])

  const value = useMemo(
    () => (trip && days ? { trip, days, settings: settings ?? defaultTripSettings(trip.id) } : null),
    [trip, days, settings],
  )

  if (trip === null) return <NotFoundPage />
  if (!value || settings === undefined) return <PageLoader />
  return (
    <TripContext.Provider value={value}>
      <Outlet />
    </TripContext.Provider>
  )
}

/** "/" opens the active trip when there is one, otherwise the trip list. */
export function RootRedirect() {
  const settings = useAppSettings()
  const activeId = settings?.activeTripId ?? null
  const trip = useTrip(activeId ?? undefined)
  if (settings === undefined || (activeId && trip === undefined)) return <PageLoader />
  return <Navigate to={trip ? `/trip/${trip.id}` : '/trips'} replace />
}
