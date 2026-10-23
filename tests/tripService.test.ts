// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { getSetting } from '@/db/repositories/settingsRepository'
import { listTripDays } from '@/db/repositories/tripRepository'
import { createExpense } from '@/services/expenseService'
import { createActivity, updateTripDay } from '@/services/itineraryService'
import { createPlace } from '@/services/placeService'
import { createShoppingItem, setPurchasedQuantity } from '@/services/shoppingService'
import { createTrip, deleteTrip, duplicateTrip, getTripStats, updateTrip } from '@/services/tripService'
import { createBooking } from '@/services/bookingService'
import { DateChangeConflictError, ValidationError } from '@/utils/errors'
import { makeTrip, pngBlob, tripInput } from './helpers'

describe('trip creation', () => {
  it('creates the trip, its settings and one day per date, and activates it', async () => {
    const { trip, days } = await makeTrip()
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
    expect(days.map((d) => d.dayOrder)).toEqual([1, 2, 3, 4, 5])
    expect((await db.trip_settings.get(trip.id))?.baseCurrency).toBe('JPY')
    expect(await getSetting('activeTripId')).toBe(trip.id)
  })

  it('rejects an end date before the start date and leaves nothing behind', async () => {
    const attempt = createTrip(tripInput({ startDate: '2026-11-10', endDate: '2026-11-09' }), { baseCurrency: 'JPY' })
    await expect(attempt).rejects.toBeInstanceOf(ValidationError)
    await expect(attempt).rejects.toMatchObject({ issues: [{ path: 'endDate', message: 'v.endBeforeStart' }] })
    expect(await db.trips.count()).toBe(0)
    expect(await db.trip_days.count()).toBe(0)
  })

  it('validates required fields, time zone and currency', async () => {
    await expect(createTrip(tripInput({ name: '  ' }), { baseCurrency: 'JPY' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createTrip(tripInput({ timezone: 'Nowhere/City' }), { baseCurrency: 'JPY' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createTrip(tripInput(), { baseCurrency: 'XYZ' })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('changing trip dates', () => {
  it('extends and shrinks empty days without asking', async () => {
    const { trip } = await makeTrip()
    await updateTrip(trip.id, tripInput({ endDate: '2026-11-16' }))
    expect((await listTripDays(trip.id)).length).toBe(7)
    await updateTrip(trip.id, tripInput({ endDate: '2026-11-12' }))
    expect((await listTripDays(trip.id)).map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
  })

  it('refuses to drop days that hold activities unless a strategy is chosen', async () => {
    const { trip, days } = await makeTrip()
    const last = await createActivity(trip.id, { tripDayId: days[4].id, title: 'Last dinner', status: 'planned' })
    await updateTripDay(days[3].id, { title: 'Free day', notes: 'Remember the bakery' })

    const shrink = updateTrip(trip.id, tripInput({ endDate: '2026-11-12' }))
    await expect(shrink).rejects.toBeInstanceOf(DateChangeConflictError)
    await expect(shrink).rejects.toMatchObject({ conflicts: [{ date: '2026-11-13', hasNotes: true }, { date: '2026-11-14', activityCount: 1 }] })
    expect((await listTripDays(trip.id)).length).toBe(5) // nothing changed

    await updateTrip(trip.id, tripInput({ endDate: '2026-11-12' }), { dateStrategy: 'keep-dates' })
    const after = await listTripDays(trip.id)
    expect(after.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    const moved = await db.activities.get(last.id)
    expect(moved?.tripDayId).toBe(after[2].id) // nearest remaining day
    expect(after[2].notes).toContain('Remember the bakery') // day notes are kept too
  })

  it('shifts the whole plan with the start date', async () => {
    const { trip, days } = await makeTrip()
    const a1 = await createActivity(trip.id, { tripDayId: days[0].id, title: 'Arrive', status: 'planned' })
    const a5 = await createActivity(trip.id, { tripDayId: days[4].id, title: 'Fly home', status: 'planned' })
    await updateTrip(trip.id, tripInput({ startDate: '2026-12-01', endDate: '2026-12-05' }), { dateStrategy: 'shift' })
    const after = await listTripDays(trip.id)
    expect(after.map((d) => d.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'])
    expect((await db.activities.get(a1.id))?.tripDayId).toBe(after[0].id)
    expect((await db.activities.get(a5.id))?.tripDayId).toBe(after[4].id)
    expect(after[0].id).toBe(days[0].id) // day ids are preserved
  })
})

describe('deleting and duplicating trips', () => {
  async function fillTrip() {
    const { trip, days } = await makeTrip()
    const place = await createPlace(trip.id, { name: 'Senso-ji', categoryId: 'attraction', isVisited: true })
    const activity = await createActivity(trip.id, { tripDayId: days[0].id, placeId: place.id, title: 'Temple', status: 'completed' })
    const item = await createShoppingItem(
      trip.id,
      { name: 'Matcha KitKat', quantity: 2, purchasedQuantity: 0, currency: 'JPY', priority: 'medium', cancelled: false, estimatedUnitPrice: 600 },
      { kind: 'replace', file: { blob: pngBlob(), filename: 'kitkat.png', mimeType: 'image/png', size: 64 } },
    )
    await setPurchasedQuantity(item.id, 2, 580)
    await createBooking(trip.id, { type: 'hotel', title: 'Hotel', startLocalDateTime: '2026-11-10T15:00', endLocalDateTime: '2026-11-14T11:00' })
    await createExpense(trip.id, { description: 'Taxi', amount: 1500, currency: 'JPY', expenseDate: '2026-11-10', category: 'transport', activityId: activity.id })
    return { trip, days, place, activity, item }
  }

  it('deletes every related record in one operation', async () => {
    const { trip } = await fillTrip()
    const other = await makeTrip({ name: 'Other trip' })
    await deleteTrip(trip.id)
    const stats = await getTripStats(trip.id)
    expect(Object.values(stats).every((n) => n === 0)).toBe(true)
    expect(await db.trip_settings.get(trip.id)).toBeUndefined()
    expect(await db.trips.get(other.trip.id)).toBeDefined()
    expect((await getTripStats(other.trip.id)).days).toBe(5)
  })

  it('duplicates the plan to new dates with fresh ids and reset progress', async () => {
    const { trip } = await fillTrip()
    const copy = await duplicateTrip(trip.id, { name: 'Tokyo again', startDate: '2027-04-01' })
    expect(copy.id).not.toBe(trip.id)
    expect(copy.startDate).toBe('2027-04-01')
    expect(copy.endDate).toBe('2027-04-05')
    const stats = await getTripStats(copy.id)
    expect(stats).toMatchObject({ days: 5, places: 1, activities: 1, shoppingItems: 1, bookings: 0, expenses: 0, attachments: 1 })
    const [item] = await db.shopping_items.where('tripId').equals(copy.id).toArray()
    expect(item).toMatchObject({ status: 'to_buy', purchasedQuantity: 0, actualUnitPrice: null })
    expect(item.imageId).toBeTruthy()
    expect((await db.attachments.get(item.imageId!))?.ownerId).toBe(item.id)
    const [activity] = await db.activities.where('tripId').equals(copy.id).toArray()
    const [place] = await db.places.where('tripId').equals(copy.id).toArray()
    expect(activity).toMatchObject({ status: 'planned', placeId: place.id })
    expect(place.isVisited).toBe(false)
  })
})
