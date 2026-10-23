import Dexie from 'dexie'
import { db } from '../database'
import type { Trip, TripDay, TripSettings } from '@/types/entities'

export async function listTrips(): Promise<Trip[]> {
  return db.trips.orderBy('startDate').toArray()
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  return db.trips.get(id)
}

/** Trip days in calendar order. */
export async function listTripDays(tripId: string): Promise<TripDay[]> {
  return db.trip_days
    .where('[tripId+date]')
    .between([tripId, Dexie.minKey], [tripId, Dexie.maxKey])
    .toArray()
}

export async function getTripSettings(tripId: string): Promise<TripSettings | undefined> {
  return db.trip_settings.get(tripId)
}
