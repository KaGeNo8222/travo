import type { Activity, TripDay } from '@/types/entities'
import { addDaysToDate, timeToMinutes, todayInTimeZone, zonedToInstant } from './time'

/** Scheduled activities first (by start time, then manual order), then unscheduled by order. */
export function compareActivities(a: Activity, b: Activity): number {
  if (a.startTime && b.startTime) {
    return a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder
  }
  if (a.startTime) return -1
  if (b.startTime) return 1
  return a.sortOrder - b.sortOrder
}

export function splitSchedule(activities: readonly Activity[]): {
  scheduled: Activity[]
  unscheduled: Activity[]
} {
  const sorted = [...activities].sort(compareActivities)
  return {
    scheduled: sorted.filter((a) => a.startTime),
    unscheduled: sorted.filter((a) => !a.startTime),
  }
}

/** True when the end time is earlier than the start time, i.e. it finishes after midnight. */
export function endsNextDay(a: Pick<Activity, 'startTime' | 'endTime'>): boolean {
  return !!(a.startTime && a.endTime && a.endTime < a.startTime)
}

/** Minutes from the day's midnight; activities without an end are a single point. */
export function activityRange(
  a: Pick<Activity, 'startTime' | 'endTime'>,
): { start: number; end: number } | null {
  if (!a.startTime) return null
  const start = timeToMinutes(a.startTime)
  if (!a.endTime) return { start, end: start }
  let end = timeToMinutes(a.endTime)
  if (end < start) end += 24 * 60
  return { start, end }
}

/** Map of activity id → ids of other activities on the same day whose times overlap. */
export function findOverlaps(activities: readonly Activity[]): Map<string, string[]> {
  const ranged = activities
    .filter((a) => a.status !== 'skipped')
    .map((a) => ({ a, r: activityRange(a) }))
    .filter((x): x is { a: Activity; r: { start: number; end: number } } => x.r !== null)
  const result = new Map<string, string[]>()
  for (let i = 0; i < ranged.length; i++) {
    for (let j = i + 1; j < ranged.length; j++) {
      const A = ranged[i]
      const B = ranged[j]
      if (A.a.tripDayId !== B.a.tripDayId) continue
      const overlap =
        A.r.start === B.r.start || (A.r.start < B.r.end && B.r.start < A.r.end)
      if (!overlap) continue
      result.set(A.a.id, [...(result.get(A.a.id) ?? []), B.a.id])
      result.set(B.a.id, [...(result.get(B.a.id) ?? []), A.a.id])
    }
  }
  return result
}

/** How long an activity without an end time still counts as "now". */
export const POINT_ACTIVITY_WINDOW_MIN = 60

export interface TimedActivity {
  activity: Activity
  day: TripDay
  start: Date
  end: Date
  isCurrent: boolean
}

/** The activity happening now, or else the next planned one, in the trip's time zone. */
export function findCurrentOrNext(
  days: readonly TripDay[],
  activities: readonly Activity[],
  tz: string,
  now: Date = new Date(),
): TimedActivity | null {
  const yesterday = addDaysToDate(todayInTimeZone(tz, now), -1)
  const dayById = new Map(days.map((d) => [d.id, d]))
  let best: TimedActivity | null = null
  for (const activity of activities) {
    if (activity.status !== 'planned' || !activity.startTime) continue
    const day = dayById.get(activity.tripDayId)
    if (!day || day.date < yesterday) continue
    const start = zonedToInstant(day.date, activity.startTime, tz)
    const end = activity.endTime
      ? zonedToInstant(
          endsNextDay(activity) ? addDaysToDate(day.date, 1) : day.date,
          activity.endTime,
          tz,
        )
      : new Date(start.getTime() + POINT_ACTIVITY_WINDOW_MIN * 60000)
    if (end.getTime() <= now.getTime()) continue
    if (!best || start.getTime() < best.start.getTime()) {
      best = { activity, day, start, end, isCurrent: start.getTime() <= now.getTime() }
    }
  }
  return best
}

/** Next sort order to append an activity at the end of a day. */
export function nextSortOrder(activities: readonly Pick<Activity, 'sortOrder'>[]): number {
  return activities.reduce((max, a) => Math.max(max, a.sortOrder), -1) + 1
}
