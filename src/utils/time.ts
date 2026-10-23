import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { Trip, TripStatus } from '@/types/entities'

// Conventions:
// - Calendar dates are local "YYYY-MM-DD" strings with no time zone attached.
// - Wall-clock times are "HH:mm" strings, interpreted in the trip (or booking) time zone.
// - Instants (Date / ISO UTC strings) are only produced when comparing against "now".

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const LOCAL_DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/

export const MAX_TRIP_DAYS = 120

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export function isValidTimeString(value: string): boolean {
  return TIME_RE.test(value)
}

export function isValidLocalDateTime(value: string): boolean {
  const m = LOCAL_DATE_TIME_RE.exec(value)
  return !!m && isValidDateString(m[1]) && isValidTimeString(m[2])
}

export function splitLocalDateTime(value: string): { date: string; time: string } {
  const [date, time = '00:00'] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

const tzCache = new Map<string, boolean>()
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  let ok = tzCache.get(tz)
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      ok = true
    } catch {
      ok = false
    }
    tzCache.set(tz, ok)
  }
  return ok
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const FALLBACK_TIME_ZONES = [
  'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta', 'Asia/Manila',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
  'Europe/Zurich', 'Europe/Istanbul', 'America/New_York', 'America/Los_Angeles',
  'Australia/Sydney', 'Pacific/Auckland', 'UTC',
]

export function listTimeZones(): string[] {
  let zones: string[] = FALLBACK_TIME_ZONES
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      zones = Intl.supportedValuesOf('timeZone')
    } catch {
      // keep fallback
    }
  }
  const set = new Set(zones)
  set.add('UTC')
  set.add(deviceTimeZone())
  return [...set].sort()
}

export function addDaysToDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

/** Inclusive list of dates from start to end. */
export function enumerateDates(start: string, end: string): string[] {
  const n = daysBetween(start, end)
  if (n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => addDaysToDate(start, i))
}

export function todayInTimeZone(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd')
}

export function timeInTimeZone(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, 'HH:mm')
}

/** Converts a local date + wall-clock time in `tz` to an absolute instant. */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  return fromZonedTime(`${date}T${time}:00`, tz)
}

export function localDateTimeToInstant(localDateTime: string, tz: string): Date {
  const { date, time } = splitLocalDateTime(localDateTime)
  return zonedToInstant(date, time, tz)
}

/** The local calendar date of an ISO instant as seen in `tz`. */
export function instantToLocalDate(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, 'yyyy-MM-dd')
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** "GMT+7", "GMT+5:30", "GMT-4" — the offset of `tz` at the given instant. */
export function gmtOffsetLabel(tz: string, at: Date = new Date()): string {
  const raw = formatInTimeZone(at, tz, 'xxx')
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(raw)
  if (!m || (m[2] === '00' && m[3] === '00')) return 'GMT'
  const hours = String(Number(m[2]))
  return `GMT${m[1]}${hours}${m[3] === '00' ? '' : `:${m[3]}`}`
}

/** Minutes between two local date-times that may be in different time zones. */
export function durationBetweenLocal(
  startLocal: string,
  startTz: string,
  endLocal: string,
  endTz: string,
): number {
  const start = localDateTimeToInstant(startLocal, startTz).getTime()
  const end = localDateTimeToInstant(endLocal, endTz).getTime()
  return Math.round((end - start) / 60000)
}

/**
 * Status to display for a trip. Manual "archived" and "completed" are always respected;
 * otherwise the status follows the calendar in the trip's own time zone.
 */
export function getDisplayStatus(
  trip: Pick<Trip, 'status' | 'startDate' | 'endDate' | 'timezone'>,
  now: Date = new Date(),
): TripStatus {
  if (trip.status === 'archived' || trip.status === 'completed') return trip.status
  const today = todayInTimeZone(trip.timezone, now)
  if (today > trip.endDate) return 'completed'
  if (today >= trip.startDate) return 'ongoing'
  return trip.status === 'planning' ? 'planning' : 'upcoming'
}

export function tripLengthDays(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  return daysBetween(trip.startDate, trip.endDate) + 1
}
