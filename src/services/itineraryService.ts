import { db } from '@/db/database'
import { listActivitiesByDay } from '@/db/repositories/activityRepository'
import { activitySchema, tripDaySchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Activity, ActivityStatus, TransportMode, TripDay } from '@/types/entities'
import { IntegrityError, NotFoundError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { nextSortOrder } from '@/utils/schedule'
import { deleteOwnerAttachments } from './attachmentService'
import { insertPlace, PLACE_WRITE_TABLES, type PlaceInput } from './placeService'

export interface ActivityInput {
  tripDayId: string
  placeId?: string | null
  title: string
  startTime?: string
  endTime?: string
  activityType?: string
  transportMode?: TransportMode
  travelMinutes?: number
  notes?: string
  status: ActivityStatus
}

async function assertDay(tripId: string, dayId: string): Promise<TripDay> {
  const day = await db.trip_days.get(dayId)
  if (!day || day.tripId !== tripId) throw new IntegrityError('error.invalidDay')
  return day
}

async function resolvePlace(
  tripId: string,
  placeId: string | null | undefined,
  newPlace: PlaceInput | undefined,
): Promise<{ id: string | null; name?: string }> {
  if (newPlace) {
    const created = await insertPlace(tripId, newPlace)
    return { id: created.id, name: created.name }
  }
  if (!placeId) return { id: null }
  const place = await db.places.get(placeId)
  if (!place || place.tripId !== tripId) throw new IntegrityError('error.invalidPlace')
  return { id: place.id, name: place.name }
}

const WRITE_TABLES = () => [db.trips, db.trip_days, db.activities, ...PLACE_WRITE_TABLES()]

export async function createActivity(
  tripId: string,
  input: ActivityInput,
  options: { newPlace?: PlaceInput } = {},
): Promise<Activity> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    if (!(await db.trips.get(tripId))) throw new NotFoundError('trip')
    await assertDay(tripId, input.tripDayId)
    const place = await resolvePlace(tripId, input.placeId, options.newPlace)
    const siblings = await listActivitiesByDay(input.tripDayId)
    const ts = nowIso()
    const activity = validate(activitySchema, {
      ...input,
      id: newId(),
      tripId,
      placeId: place.id,
      title: input.title.trim() || place.name || '',
      sortOrder: nextSortOrder(siblings),
      completedAt: input.status === 'completed' ? ts : null,
      createdAt: ts,
      updatedAt: ts,
    })
    await db.activities.add(activity)
    return activity
  })
}

export async function updateActivity(
  id: string,
  input: ActivityInput,
  options: { newPlace?: PlaceInput } = {},
): Promise<Activity> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    const existing = await db.activities.get(id)
    if (!existing) throw new NotFoundError('activity')
    await assertDay(existing.tripId, input.tripDayId)
    const place = await resolvePlace(existing.tripId, input.placeId, options.newPlace)
    const movedDay = input.tripDayId !== existing.tripDayId
    const ts = nowIso()
    const activity = validate(activitySchema, {
      ...existing,
      // Clear optional fields the form left empty.
      startTime: undefined,
      endTime: undefined,
      activityType: undefined,
      transportMode: undefined,
      travelMinutes: undefined,
      notes: undefined,
      ...input,
      placeId: place.id,
      title: input.title.trim() || place.name || '',
      sortOrder: movedDay ? nextSortOrder(await listActivitiesByDay(input.tripDayId)) : existing.sortOrder,
      completedAt: input.status === 'completed' ? (existing.completedAt ?? ts) : null,
      updatedAt: ts,
    })
    await db.activities.put(activity)
    return activity
  })
}

export async function deleteActivity(id: string): Promise<void> {
  await db.transaction('rw', [db.activities, db.attachments, db.expenses], async () => {
    await deleteOwnerAttachments('activity', id)
    await db.expenses.where('activityId').equals(id).modify({ activityId: null })
    await db.activities.delete(id)
  })
}

/** Copies an activity right after the original, reset to "planned". */
export async function duplicateActivity(id: string): Promise<Activity> {
  return db.transaction('rw', [db.activities], async () => {
    const original = await db.activities.get(id)
    if (!original) throw new NotFoundError('activity')
    const ts = nowIso()
    await db.activities
      .where('tripDayId')
      .equals(original.tripDayId)
      .and((a) => a.sortOrder > original.sortOrder)
      .modify((a) => {
        a.sortOrder += 1
      })
    const copy: Activity = {
      ...original,
      id: newId(),
      sortOrder: original.sortOrder + 1,
      status: 'planned',
      completedAt: null,
      createdAt: ts,
      updatedAt: ts,
    }
    await db.activities.add(copy)
    return copy
  })
}

export async function moveActivity(id: string, targetDayId: string): Promise<void> {
  await db.transaction('rw', [db.activities, db.trip_days], async () => {
    const activity = await db.activities.get(id)
    if (!activity) throw new NotFoundError('activity')
    if (activity.tripDayId === targetDayId) return
    await assertDay(activity.tripId, targetDayId)
    const sortOrder = nextSortOrder(await listActivitiesByDay(targetDayId))
    await db.activities.update(id, { tripDayId: targetDayId, sortOrder, updatedAt: nowIso() })
  })
}

/** Rewrites the manual order of a day's activities to match `orderedIds`. */
export async function reorderDay(dayId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', [db.activities], async () => {
    const activities = await listActivitiesByDay(dayId)
    const known = new Set(activities.map((a) => a.id))
    if (orderedIds.some((id) => !known.has(id))) throw new IntegrityError('error.invalidDay')
    // Activities not listed keep their relative order after the listed ones.
    const rest = activities.filter((a) => !orderedIds.includes(a.id)).map((a) => a.id)
    const ts = nowIso()
    let order = 0
    for (const activityId of [...orderedIds, ...rest]) {
      await db.activities.update(activityId, { sortOrder: order++, updatedAt: ts })
    }
  })
}

export async function setActivityStatus(id: string, status: ActivityStatus): Promise<void> {
  const ts = nowIso()
  const updated = await db.activities.update(id, {
    status,
    completedAt: status === 'completed' ? ts : null,
    updatedAt: ts,
  })
  if (!updated) throw new NotFoundError('activity')
}

/** Schedules a saved place on a day. */
export async function addPlaceToDay(placeId: string, dayId: string, startTime?: string): Promise<Activity> {
  const place = await db.places.get(placeId)
  if (!place) throw new NotFoundError('place')
  return createActivity(place.tripId, {
    tripDayId: dayId,
    placeId,
    title: place.name,
    startTime,
    status: 'planned',
  })
}

export async function updateTripDay(dayId: string, input: { title?: string; notes?: string }): Promise<TripDay> {
  return db.transaction('rw', [db.trip_days], async () => {
    const day = await db.trip_days.get(dayId)
    if (!day) throw new NotFoundError('day')
    const next = validate(tripDaySchema, { ...day, title: input.title, notes: input.notes, updatedAt: nowIso() })
    await db.trip_days.put(next)
    return next
  })
}
