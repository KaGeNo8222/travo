import { createContext, useContext } from 'react'
import type { Trip, TripDay, TripSettings } from '@/types/entities'

export interface TripContextValue {
  trip: Trip
  /** Days in calendar order. */
  days: TripDay[]
  settings: TripSettings
}

export const TripContext = createContext<TripContextValue | null>(null)

/** The trip of the current /trip/:tripId route. Only usable below TripLayout. */
export function useTripContext(): TripContextValue {
  const value = useContext(TripContext)
  if (!value) throw new Error('useTripContext must be used inside TripLayout')
  return value
}
