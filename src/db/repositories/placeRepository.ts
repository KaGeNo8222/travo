import { db } from '../database'
import type { Place } from '@/types/entities'

export async function listPlacesByTrip(tripId: string): Promise<Place[]> {
  const places = await db.places.where('tripId').equals(tripId).toArray()
  return places.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPlace(id: string): Promise<Place | undefined> {
  return db.places.get(id)
}

export interface PlaceUsage {
  activities: number
  shoppingItems: number
  bookings: number
}

export async function getPlaceUsage(placeId: string): Promise<PlaceUsage> {
  const [activities, shoppingItems, bookings] = await Promise.all([
    db.activities.where('placeId').equals(placeId).count(),
    db.shopping_items.where('shopPlaceId').equals(placeId).count(),
    db.bookings.where('placeId').equals(placeId).count(),
  ])
  return { activities, shoppingItems, bookings }
}
