import { db } from '@/db/database'
import { isSystemCategoryId } from '@/db/seed'
import type { Attachment, TripDay } from '@/types/entities'
import { newId, nowIso } from '@/utils/id'
import { enumerateDates } from '@/utils/time'
import { defaultTripSettings } from './tripService'

export interface IntegrityReport {
  /** Records whose trip no longer exists. */
  orphanRecords: number
  /** Attachments whose owner no longer exists. */
  orphanAttachments: number
  /** Optional links (place, image, activity …) pointing at missing records. */
  danglingLinks: number
  /** Activities whose day is missing. */
  homelessActivities: number
  missingSettings: number
  missingDays: number
}

export function isReportClean(r: IntegrityReport): boolean {
  return Object.values(r).every((n) => n === 0)
}

/**
 * Scans the database for broken references. With `repair`, fixes them in one transaction:
 * orphans are deleted, dangling optional links are cleared, missing days and settings are
 * recreated, and activities without a day move to the trip's first day.
 */
export async function checkIntegrity(repair = false): Promise<IntegrityReport> {
  return db.transaction(repair ? 'rw' : 'r', db.allTables, async () => {
    const report: IntegrityReport = {
      orphanRecords: 0,
      orphanAttachments: 0,
      danglingLinks: 0,
      homelessActivities: 0,
      missingSettings: 0,
      missingDays: 0,
    }
    const ts = nowIso()
    const [trips, days, places, activities, items, bookings, expenses, settings, categories, attachments] =
      await Promise.all([
        db.trips.toArray(),
        db.trip_days.toArray(),
        db.places.toArray(),
        db.activities.toArray(),
        db.shopping_items.toArray(),
        db.bookings.toArray(),
        db.expenses.toArray(),
        db.trip_settings.toArray(),
        db.categories.toArray(),
        db.attachments.toArray(),
      ])

    const tripIds = new Set(trips.map((t) => t.id))
    const orphan = <R extends { id: string; tripId: string }>(rows: R[]) => rows.filter((r) => !tripIds.has(r.tripId)).map((r) => r.id)
    const orphanIds = {
      days: orphan(days),
      places: orphan(places),
      activities: orphan(activities),
      items: orphan(items),
      bookings: orphan(bookings),
      expenses: orphan(expenses),
      attachments: orphan(attachments),
    }
    report.orphanRecords = Object.values(orphanIds).reduce((n, ids) => n + ids.length, 0)
    const orphanSettings = settings.filter((s) => !tripIds.has(s.tripId)).map((s) => s.tripId)
    report.orphanRecords += orphanSettings.length

    const dayById = new Map(days.filter((d) => tripIds.has(d.tripId)).map((d) => [d.id, d]))
    const placeIds = new Set(places.map((p) => p.id))
    const activityIds = new Set(activities.map((a) => a.id))
    const itemIds = new Set(items.map((s) => s.id))
    const bookingIds = new Set(bookings.map((b) => b.id))
    const attachmentIds = new Set(attachments.map((a) => a.id))
    const categoryIds = new Set(categories.map((c) => c.id))

    const owners: Record<Attachment['ownerType'], Set<string>> = {
      trip: tripIds,
      place: placeIds,
      activity: activityIds,
      shopping: itemIds,
      booking: bookingIds,
    }
    const orphanAttachments = attachments.filter((a) => tripIds.has(a.tripId) && !owners[a.ownerType].has(a.ownerId)).map((a) => a.id)
    report.orphanAttachments = orphanAttachments.length

    // Days that should exist for each trip's date range.
    const newDays: TripDay[] = []
    const firstDayByTrip = new Map<string, string>()
    const datesByTrip = new Map<string, Set<string>>()
    for (const d of dayById.values()) {
      if (!datesByTrip.has(d.tripId)) datesByTrip.set(d.tripId, new Set())
      datesByTrip.get(d.tripId)!.add(d.date)
    }
    for (const trip of trips) {
      const existing = datesByTrip.get(trip.id) ?? new Set<string>()
      enumerateDates(trip.startDate, trip.endDate).forEach((date, i) => {
        if (!existing.has(date)) newDays.push({ id: newId(), tripId: trip.id, date, dayOrder: i + 1, createdAt: ts, updatedAt: ts })
      })
      const first = [...dayById.values(), ...newDays]
        .filter((d) => d.tripId === trip.id)
        .sort((a, b) => a.date.localeCompare(b.date))[0]
      if (first) firstDayByTrip.set(trip.id, first.id)
    }
    report.missingDays = newDays.length
    const settingsTrips = new Set(settings.map((s) => s.tripId))
    const missingSettings = trips.filter((t) => !settingsTrips.has(t.id))
    report.missingSettings = missingSettings.length

    const homeless = activities.filter((a) => tripIds.has(a.tripId) && !dayById.has(a.tripDayId))
    report.homelessActivities = homeless.length

    const dangling = (id: string | null | undefined, set: Set<string>) => !!id && !set.has(id)
    const danglingActivities = activities.filter((a) => dangling(a.placeId, placeIds))
    const danglingItems = items.filter((s) => dangling(s.shopPlaceId, placeIds) || dangling(s.imageId, attachmentIds))
    const danglingBookings = bookings.filter((b) => dangling(b.placeId, placeIds))
    const danglingExpenses = expenses.filter((e) => dangling(e.activityId, activityIds) || dangling(e.shoppingItemId, itemIds))
    const danglingTrips = trips.filter((t) => dangling(t.coverImageId, attachmentIds))
    const badCategories = places.filter((p) => p.categoryId && !categoryIds.has(p.categoryId) && !isSystemCategoryId(p.categoryId))
    report.danglingLinks =
      danglingActivities.length +
      danglingItems.length +
      danglingBookings.length +
      danglingExpenses.length +
      danglingTrips.length +
      badCategories.length

    if (!repair) return report

    await db.trip_days.bulkDelete(orphanIds.days)
    await db.places.bulkDelete(orphanIds.places)
    await db.activities.bulkDelete(orphanIds.activities)
    await db.shopping_items.bulkDelete(orphanIds.items)
    await db.bookings.bulkDelete(orphanIds.bookings)
    await db.expenses.bulkDelete(orphanIds.expenses)
    await db.attachments.bulkDelete([...orphanIds.attachments, ...orphanAttachments])
    await db.trip_settings.bulkDelete(orphanSettings)
    await db.trip_days.bulkAdd(newDays)
    await db.trip_settings.bulkAdd(missingSettings.map((t) => defaultTripSettings(t.id)))
    for (const a of homeless) {
      const dayId = firstDayByTrip.get(a.tripId)
      if (dayId) await db.activities.update(a.id, { tripDayId: dayId, updatedAt: ts })
      else await db.activities.delete(a.id)
    }
    for (const a of danglingActivities) await db.activities.update(a.id, { placeId: null, updatedAt: ts })
    for (const s of danglingItems) {
      await db.shopping_items.update(s.id, {
        shopPlaceId: dangling(s.shopPlaceId, placeIds) ? null : s.shopPlaceId,
        imageId: dangling(s.imageId, attachmentIds) ? null : s.imageId,
        updatedAt: ts,
      })
    }
    for (const b of danglingBookings) await db.bookings.update(b.id, { placeId: null, updatedAt: ts })
    for (const e of danglingExpenses) {
      await db.expenses.update(e.id, {
        activityId: dangling(e.activityId, activityIds) ? null : e.activityId,
        shoppingItemId: dangling(e.shoppingItemId, itemIds) ? null : e.shoppingItemId,
        updatedAt: ts,
      })
    }
    for (const t of danglingTrips) await db.trips.update(t.id, { coverImageId: null, updatedAt: ts })
    for (const p of badCategories) await db.places.update(p.id, { categoryId: 'other', category: 'other', updatedAt: ts })
    return report
  })
}
