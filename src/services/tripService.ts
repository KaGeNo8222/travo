import { db } from '@/db/database'
import { listTripDays } from '@/db/repositories/tripRepository'
import { getSetting, setSetting } from '@/db/repositories/settingsRepository'
import { tripDaySchema, tripSchema, tripSettingsSchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Activity, Attachment, Trip, TripDay, TripSettings, TripStatus } from '@/types/entities'
import { DateChangeConflictError, NotFoundError, type DayConflict } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { addDaysToDate, daysBetween, enumerateDates } from '@/utils/time'
import { applyImageChange, type ImageChange } from './attachmentService'
import { recalculateExpenses } from './expenseService'

export interface TripInput {
  name: string
  destinationCountry: string
  destinationCities: string[]
  startDate: string
  endDate: string
  timezone: string
  status: TripStatus
  notes?: string
}

/**
 * How existing days map onto a new date range:
 * - "keep-dates": days keep their calendar date; days outside the range are removed and
 *   their activities move to the nearest remaining day.
 * - "shift": the plan moves with the start date (old day 1 becomes new day 1, ...).
 */
export type DateStrategy = 'keep-dates' | 'shift'

/**
 * Totals start in the local currency, which works before any exchange rate is entered;
 * the user can switch the display to THB once a rate is set.
 */
export function defaultTripSettings(tripId: string, baseCurrency = 'THB'): TripSettings {
  return {
    tripId,
    baseCurrency,
    displayCurrency: baseCurrency,
    budgetAmount: null,
    budgetCurrency: null,
    exchangeRateToTHB: null,
    otherRatesToTHB: {},
    updatedAt: nowIso(),
  }
}

function buildDay(tripId: string, date: string, dayOrder: number, ts: string): TripDay {
  return validate(tripDaySchema, { id: newId(), tripId, date, dayOrder, createdAt: ts, updatedAt: ts })
}

const MAX_NOTES = 5000

function appendNote(existing: string | undefined, addition: string): string {
  return (existing ? `${existing}\n\n${addition}` : addition).slice(0, MAX_NOTES)
}

export interface DayPlan {
  days: TripDay[]
  moves: Array<{ activityId: string; toDayId: string }>
  conflicts: DayConflict[]
  removedDayIds: string[]
}

/** Pure planning step for a date-range change; nothing is deleted silently. */
export function planDayChanges(
  tripId: string,
  oldDays: readonly TripDay[],
  activities: readonly Pick<Activity, 'id' | 'tripDayId'>[],
  startDate: string,
  endDate: string,
  strategy: DateStrategy,
  ts: string,
): DayPlan {
  const dates = enumerateDates(startDate, endDate)
  const sorted = [...oldDays].sort((a, b) => a.date.localeCompare(b.date))
  const kept = new Set<string>()
  const days: TripDay[] = []
  const byDate = new Map(sorted.map((d) => [d.date, d]))

  dates.forEach((date, i) => {
    const old = strategy === 'shift' ? sorted[i] : byDate.get(date)
    if (!old) {
      days.push(buildDay(tripId, date, i + 1, ts))
      return
    }
    kept.add(old.id)
    const changed = old.date !== date || old.dayOrder !== i + 1
    days.push(changed ? { ...old, date, dayOrder: i + 1, updatedAt: ts } : { ...old })
  })

  const activityCount = new Map<string, number>()
  for (const a of activities) activityCount.set(a.tripDayId, (activityCount.get(a.tripDayId) ?? 0) + 1)

  const removed = sorted.filter((d) => !kept.has(d.id))
  const conflicts: DayConflict[] = []
  const moves: DayPlan['moves'] = []
  for (const day of removed) {
    const count = activityCount.get(day.id) ?? 0
    const hasNotes = !!(day.title || day.notes)
    if (count === 0 && !hasNotes) continue
    conflicts.push({ dayId: day.id, date: day.date, activityCount: count, hasNotes })
    const target =
      strategy === 'shift'
        ? days[days.length - 1]
        : days.reduce((best, d) =>
            Math.abs(daysBetween(day.date, d.date)) < Math.abs(daysBetween(day.date, best.date)) ? d : best,
          )
    for (const a of activities) if (a.tripDayId === day.id) moves.push({ activityId: a.id, toDayId: target.id })
    if (hasNotes) {
      const heading = [day.date, day.title].filter(Boolean).join(' · ')
      target.notes = appendNote(target.notes, day.notes ? `${heading}\n${day.notes}` : heading)
      target.updatedAt = ts
    }
  }
  return { days, moves, conflicts, removedDayIds: removed.map((d) => d.id) }
}

async function applyDayPlan(tripId: string, plan: DayPlan, ts: string): Promise<void> {
  // Replace all day rows at once: the unique [tripId+date] index would otherwise reject
  // intermediate states while dates shift. Day ids are preserved, so activity links hold.
  await db.trip_days.where('tripId').equals(tripId).delete()
  await db.trip_days.bulkAdd(plan.days.map((d) => validate(tripDaySchema, d)))
  const nextOrder = new Map<string, number>()
  for (const move of plan.moves) {
    if (!nextOrder.has(move.toDayId)) {
      const existing = await db.activities.where('tripDayId').equals(move.toDayId).toArray()
      nextOrder.set(move.toDayId, existing.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1)
    }
    const order = nextOrder.get(move.toDayId)!
    nextOrder.set(move.toDayId, order + 1)
    await db.activities.update(move.activityId, { tripDayId: move.toDayId, sortOrder: order, updatedAt: ts })
  }
}

export async function createTrip(
  input: TripInput,
  options: { baseCurrency: string; cover?: ImageChange },
): Promise<Trip> {
  const ts = nowIso()
  const trip = validate(tripSchema, { ...input, id: newId(), coverImageId: null, createdAt: ts, updatedAt: ts })
  const settings = validate(tripSettingsSchema, {
    ...defaultTripSettings(trip.id, options.baseCurrency),
    updatedAt: ts,
  })
  const days = enumerateDates(trip.startDate, trip.endDate).map((date, i) => buildDay(trip.id, date, i + 1, ts))

  await db.transaction('rw', [db.trips, db.trip_days, db.trip_settings, db.attachments, db.app_settings], async () => {
    if (options.cover) {
      trip.coverImageId = await applyImageChange({
        tripId: trip.id,
        ownerType: 'trip',
        ownerId: trip.id,
        currentId: null,
        change: options.cover,
      })
    }
    await db.trips.add(trip)
    await db.trip_days.bulkAdd(days)
    await db.trip_settings.add(settings)
    const activeId = await getSetting('activeTripId')
    if (!activeId || !(await db.trips.get(activeId))) await setSetting('activeTripId', trip.id)
  })
  return trip
}

/**
 * Updates a trip. When the date range changes and days with content would be removed,
 * throws DateChangeConflictError unless a dateStrategy was chosen by the user.
 */
export async function updateTrip(
  id: string,
  input: TripInput,
  options: { cover?: ImageChange; dateStrategy?: DateStrategy } = {},
): Promise<Trip> {
  return db.transaction('rw', [db.trips, db.trip_days, db.activities, db.attachments], async () => {
    const existing = await db.trips.get(id)
    if (!existing) throw new NotFoundError('trip')
    const ts = nowIso()
    const next = validate(tripSchema, { ...existing, ...input, updatedAt: ts })

    if (next.startDate !== existing.startDate || next.endDate !== existing.endDate) {
      const [days, activities] = await Promise.all([
        listTripDays(id),
        db.activities.where('tripId').equals(id).toArray(),
      ])
      const plan = planDayChanges(id, days, activities, next.startDate, next.endDate, options.dateStrategy ?? 'keep-dates', ts)
      if (!options.dateStrategy && plan.conflicts.length > 0) throw new DateChangeConflictError(plan.conflicts)
      await applyDayPlan(id, plan, ts)
    }
    if (options.cover) {
      next.coverImageId = await applyImageChange({
        tripId: id,
        ownerType: 'trip',
        ownerId: id,
        currentId: existing.coverImageId,
        change: options.cover,
      })
    }
    await db.trips.put(next)
    return next
  })
}

export async function setTripStatus(id: string, status: TripStatus): Promise<void> {
  const updated = await db.trips.update(id, { status, updatedAt: nowIso() })
  if (!updated) throw new NotFoundError('trip')
}

export interface TripStats {
  days: number
  activities: number
  places: number
  shoppingItems: number
  bookings: number
  expenses: number
  attachments: number
}

export async function getTripStats(tripId: string): Promise<TripStats> {
  const [days, activities, places, shoppingItems, bookings, expenses, attachments] = await Promise.all([
    db.trip_days.where('tripId').equals(tripId).count(),
    db.activities.where('tripId').equals(tripId).count(),
    db.places.where('tripId').equals(tripId).count(),
    db.shopping_items.where('tripId').equals(tripId).count(),
    db.bookings.where('tripId').equals(tripId).count(),
    db.expenses.where('tripId').equals(tripId).count(),
    db.attachments.where('tripId').equals(tripId).count(),
  ])
  return { days, activities, places, shoppingItems, bookings, expenses, attachments }
}

/** Deletes a trip and every record that belongs to it, atomically. */
export async function deleteTrip(id: string): Promise<void> {
  await db.transaction('rw', db.tripTables, async () => {
    for (const table of [
      db.trip_days,
      db.places,
      db.activities,
      db.shopping_items,
      db.bookings,
      db.attachments,
      db.expenses,
    ]) {
      await table.where('tripId').equals(id).delete()
    }
    await db.trip_settings.delete(id)
    await db.trips.delete(id)
    if ((await getSetting('activeTripId')) === id) await setSetting('activeTripId', null)
  })
}

/**
 * Copies the plan of a trip (days, places, activities, shopping list, settings and their
 * images) to new dates. Bookings and expenses are trip-specific and are not copied.
 */
export async function duplicateTrip(id: string, options: { name: string; startDate: string }): Promise<Trip> {
  return db.transaction('rw', db.tripTables, async () => {
    const src = await db.trips.get(id)
    if (!src) throw new NotFoundError('trip')
    const ts = nowIso()
    const offset = daysBetween(src.startDate, options.startDate)
    const trip = validate(tripSchema, {
      ...src,
      id: newId(),
      name: options.name,
      startDate: options.startDate,
      endDate: addDaysToDate(src.endDate, offset),
      status: 'planning',
      coverImageId: null,
      createdAt: ts,
      updatedAt: ts,
    })

    const ids = new Map<string, string>()
    const mapId = (old: string | null | undefined) => (old ? (ids.get(old) ?? null) : null)
    const fresh = (old: string) => {
      const n = newId()
      ids.set(old, n)
      return n
    }

    const [days, places, activities, items, attachments, settings] = await Promise.all([
      listTripDays(id),
      db.places.where('tripId').equals(id).toArray(),
      db.activities.where('tripId').equals(id).toArray(),
      db.shopping_items.where('tripId').equals(id).toArray(),
      db.attachments.where('tripId').equals(id).toArray(),
      db.trip_settings.get(id),
    ])

    const newDays = days.map((d) => ({ ...d, id: fresh(d.id), tripId: trip.id, date: addDaysToDate(d.date, offset), createdAt: ts, updatedAt: ts }))
    const newPlaces = places.map((p) => ({ ...p, id: fresh(p.id), tripId: trip.id, isVisited: false, visitedAt: null, createdAt: ts, updatedAt: ts }))
    const newActivities = activities.filter((a) => ids.has(a.tripDayId)).map((a) => ({
      ...a,
      id: fresh(a.id),
      tripId: trip.id,
      tripDayId: ids.get(a.tripDayId)!,
      placeId: mapId(a.placeId),
      status: 'planned' as const,
      completedAt: null,
      createdAt: ts,
      updatedAt: ts,
    }))
    const newItems = items.map((s) => ({
      ...s,
      id: fresh(s.id),
      tripId: trip.id,
      shopPlaceId: mapId(s.shopPlaceId),
      purchasedQuantity: 0,
      actualUnitPrice: null,
      status: 'to_buy' as const,
      purchasedAt: null,
      createdAt: ts,
      updatedAt: ts,
    }))
    ids.set(src.id, trip.id)

    const copiedAttachments: Attachment[] = []
    for (const att of attachments) {
      if (att.ownerType === 'booking') continue
      const ownerId = ids.get(att.ownerId)
      if (!ownerId) continue
      copiedAttachments.push({ ...att, id: fresh(att.id), tripId: trip.id, ownerId, createdAt: ts })
    }
    trip.coverImageId = mapId(src.coverImageId)
    for (const item of newItems) item.imageId = mapId(item.imageId)

    await db.trips.add(trip)
    await db.trip_days.bulkAdd(newDays)
    await db.places.bulkAdd(newPlaces)
    await db.activities.bulkAdd(newActivities)
    await db.shopping_items.bulkAdd(newItems)
    await db.attachments.bulkAdd(copiedAttachments)
    await db.trip_settings.add({
      ...(settings ?? defaultTripSettings(trip.id)),
      tripId: trip.id,
      updatedAt: ts,
    })
    return trip
  })
}

export async function setActiveTrip(id: string | null): Promise<void> {
  await setSetting('activeTripId', id)
}

export type TripSettingsPatch = Partial<Omit<TripSettings, 'tripId' | 'updatedAt'>>

/** Saves currency / budget settings and refreshes THB amounts that follow the trip rate. */
export async function updateTripSettings(tripId: string, patch: TripSettingsPatch): Promise<TripSettings> {
  return db.transaction('rw', [db.trips, db.trip_settings, db.expenses], async () => {
    if (!(await db.trips.get(tripId))) throw new NotFoundError('trip')
    const current = (await db.trip_settings.get(tripId)) ?? defaultTripSettings(tripId)
    const merged = { ...current, ...patch, tripId, updatedAt: nowIso() }
    // Rates for THB or the base currency belong in their dedicated fields.
    const otherRatesToTHB = Object.fromEntries(
      Object.entries(merged.otherRatesToTHB ?? {}).filter(([code]) => code !== 'THB' && code !== merged.baseCurrency),
    )
    const next = validate(tripSettingsSchema, { ...merged, otherRatesToTHB })
    await db.trip_settings.put(next)
    await recalculateExpenses(tripId, next)
    return next
  })
}
