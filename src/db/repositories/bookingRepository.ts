import { db } from '../database'
import type { Booking } from '@/types/entities'
import { localDateTimeToInstant } from '@/utils/time'

/** Absolute start time used for ordering; bookings without a start sort last. */
export function bookingStartMs(b: Booking, fallbackTz: string): number {
  if (!b.startLocalDateTime) return Number.POSITIVE_INFINITY
  return localDateTimeToInstant(b.startLocalDateTime, b.startTimezone ?? fallbackTz).getTime()
}

export async function listBookings(tripId: string, tripTz: string): Promise<Booking[]> {
  const bookings = await db.bookings.where('tripId').equals(tripId).toArray()
  return bookings.sort(
    (a, b) => bookingStartMs(a, tripTz) - bookingStartMs(b, tripTz) || a.createdAt.localeCompare(b.createdAt),
  )
}
