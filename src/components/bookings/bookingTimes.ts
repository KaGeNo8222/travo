import type { Booking } from '@/types/entities'
import { durationBetweenLocal, localDateTimeToInstant, splitLocalDateTime } from '@/utils/time'

export function bookingStart(b: Booking, tripTz: string): Date | null {
  return b.startLocalDateTime ? localDateTimeToInstant(b.startLocalDateTime, b.startTimezone ?? tripTz) : null
}

export function bookingEnd(b: Booking, tripTz: string): Date | null {
  return b.endLocalDateTime ? localDateTimeToInstant(b.endLocalDateTime, b.endTimezone ?? b.startTimezone ?? tripTz) : null
}

/** Minutes from start to end, correct across time zones (e.g. a flight BKK → HND). */
export function bookingDurationMinutes(b: Booking, tripTz: string): number | null {
  if (!b.startLocalDateTime || !b.endLocalDateTime) return null
  const startTz = b.startTimezone ?? tripTz
  return durationBetweenLocal(b.startLocalDateTime, startTz, b.endLocalDateTime, b.endTimezone ?? startTz)
}

/** Calendar days between local start and end dates (+1 for an overnight flight). */
export function dayOffset(b: Booking): number {
  if (!b.startLocalDateTime || !b.endLocalDateTime) return 0
  const a = splitLocalDateTime(b.startLocalDateTime).date
  const z = splitLocalDateTime(b.endLocalDateTime).date
  return Math.round((Date.parse(`${z}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Next flight that has not landed yet, or else the most recent one. */
export function pickFlight(bookings: readonly Booking[], tripTz: string, now: Date): Booking | null {
  const flights = bookings.filter((b) => b.type === 'flight')
  const pending = flights.find((b) => (bookingEnd(b, tripTz) ?? bookingStart(b, tripTz) ?? new Date(0)) > now)
  return pending ?? flights[flights.length - 1] ?? null
}

/** The hotel stayed in now, or else the next one. */
export function pickHotel(bookings: readonly Booking[], tripTz: string, now: Date): Booking | null {
  const hotels = bookings.filter((b) => b.type === 'hotel')
  const current = hotels.find((b) => {
    const s = bookingStart(b, tripTz)
    const e = bookingEnd(b, tripTz)
    return s && e && s <= now && now < e
  })
  return current ?? hotels.find((b) => (bookingStart(b, tripTz) ?? new Date(0)) > now) ?? hotels[0] ?? null
}
