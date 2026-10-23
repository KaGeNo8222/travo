// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { listActivitiesByDay } from '@/db/repositories/activityRepository'
import { createBooking } from '@/services/bookingService'
import { countCategoryUsage, createCategory, deleteCategory } from '@/services/categoryService'
import { createExpense } from '@/services/expenseService'
import { checkIntegrity, isReportClean } from '@/services/integrityService'
import {
  addPlaceToDay,
  createActivity,
  deleteActivity,
  duplicateActivity,
  moveActivity,
  reorderDay,
  setActivityStatus,
  updateActivity,
} from '@/services/itineraryService'
import { createPlace, deletePlace, findDuplicatePlaces } from '@/services/placeService'
import { createShoppingItem } from '@/services/shoppingService'
import { AppError, IntegrityError, ValidationError } from '@/utils/errors'
import { makeTrip } from './helpers'

describe('activities', () => {
  it('belong to a valid day of the same trip', async () => {
    const a = await makeTrip()
    const b = await makeTrip({ name: 'Other' })
    await expect(createActivity(a.trip.id, { tripDayId: b.days[0].id, title: 'x', status: 'planned' })).rejects.toBeInstanceOf(IntegrityError)
    const foreignPlace = await createPlace(b.trip.id, { name: 'Elsewhere', categoryId: 'other', isVisited: false })
    await expect(
      createActivity(a.trip.id, { tripDayId: a.days[0].id, placeId: foreignPlace.id, title: 'x', status: 'planned' }),
    ).rejects.toBeInstanceOf(IntegrityError)
  })

  it('validates start and end times', async () => {
    const { trip, days } = await makeTrip()
    const base = { tripDayId: days[0].id, title: 'x', status: 'planned' as const }
    await expect(createActivity(trip.id, { ...base, startTime: '25:00' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createActivity(trip.id, { ...base, endTime: '10:00' })).rejects.toMatchObject({ issues: [{ path: 'endTime', message: 'v.endWithoutStart' }] })
    await expect(createActivity(trip.id, { ...base, startTime: '10:00', endTime: '10:00' })).rejects.toBeInstanceOf(ValidationError)
    // Ending after midnight is allowed.
    await expect(createActivity(trip.id, { ...base, startTime: '22:00', endTime: '01:00' })).resolves.toBeDefined()
  })

  it('uses the place name when the title is empty and can create the place inline', async () => {
    const { trip, days } = await makeTrip()
    const activity = await createActivity(
      trip.id,
      { tripDayId: days[0].id, title: '  ', status: 'planned' },
      { newPlace: { name: 'Tokyo Tower', categoryId: 'attraction', isVisited: false, googleMapsUrl: 'https://maps.app.goo.gl/abc' } },
    )
    expect(activity.title).toBe('Tokyo Tower')
    expect((await db.places.get(activity.placeId!))?.googleMapsUrl).toBe('https://maps.app.goo.gl/abc')
  })

  it('moves, reorders, duplicates and completes', async () => {
    const { trip, days } = await makeTrip()
    const add = (title: string) => createActivity(trip.id, { tripDayId: days[0].id, title, status: 'planned' })
    const a = await add('A')
    const b = await add('B')
    const c = await add('C')
    await reorderDay(days[0].id, [c.id, a.id, b.id])
    expect((await listActivitiesByDay(days[0].id)).map((x) => x.title)).toEqual(['C', 'A', 'B'])

    const copy = await duplicateActivity(a.id)
    expect((await listActivitiesByDay(days[0].id)).map((x) => x.id)).toEqual([c.id, a.id, copy.id, b.id])

    await moveActivity(b.id, days[2].id)
    expect((await db.activities.get(b.id))?.tripDayId).toBe(days[2].id)
    await expect(moveActivity(b.id, 'missing-day')).rejects.toBeInstanceOf(IntegrityError)

    await setActivityStatus(c.id, 'completed')
    expect((await db.activities.get(c.id))?.completedAt).toBeTruthy()
    await updateActivity(c.id, { tripDayId: days[0].id, title: 'C', status: 'planned' })
    expect((await db.activities.get(c.id))?.completedAt).toBeNull()
  })

  it('unlinks expenses when an activity is deleted', async () => {
    const { trip, days } = await makeTrip()
    const activity = await createActivity(trip.id, { tripDayId: days[0].id, title: 'Museum', status: 'planned' })
    const expense = await createExpense(trip.id, { description: 'Ticket', amount: 1200, currency: 'JPY', expenseDate: '2026-11-10', category: 'activity', activityId: activity.id })
    await deleteActivity(activity.id)
    expect(await db.activities.get(activity.id)).toBeUndefined()
    expect((await db.expenses.get(expense.id))?.activityId).toBeNull()
  })

  it('schedules a saved place on a day', async () => {
    const { trip, days } = await makeTrip()
    const place = await createPlace(trip.id, { name: 'Shibuya Sky', categoryId: 'attraction', isVisited: false })
    const activity = await addPlaceToDay(place.id, days[1].id, '17:00')
    expect(activity).toMatchObject({ title: 'Shibuya Sky', placeId: place.id, tripDayId: days[1].id, startTime: '17:00' })
  })
})

describe('places', () => {
  it('rejects links that are not Google Maps and keeps valid ones unchanged', async () => {
    const { trip } = await makeTrip()
    await expect(createPlace(trip.id, { name: 'X', categoryId: 'other', isVisited: false, googleMapsUrl: 'https://example.com/x' })).rejects.toMatchObject({
      issues: [{ path: 'googleMapsUrl', message: 'v.invalidMapsUrl' }],
    })
    const url = 'https://www.google.com/maps/search/?api=1&query=Senso-ji&query_place_id=ChIJ8T1GpMGOGGARDYGSgpooDWw'
    const place = await createPlace(trip.id, { name: 'Senso-ji', categoryId: 'attraction', isVisited: false, googleMapsUrl: url })
    expect(place.googleMapsUrl).toBe(url)
    expect(place.googlePlaceId).toBe('ChIJ8T1GpMGOGGARDYGSgpooDWw')
    expect(place.latitude ?? null).toBeNull() // nothing invented
  })

  it('requires both coordinates', async () => {
    const { trip } = await makeTrip()
    await expect(createPlace(trip.id, { name: 'X', categoryId: 'other', isVisited: false, latitude: 35 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('detects likely duplicates by name, link or nearby coordinates', async () => {
    const { trip } = await makeTrip()
    await createPlace(trip.id, { name: 'Senso-ji Temple', categoryId: 'attraction', isVisited: false, latitude: 35.7148, longitude: 139.7967 })
    expect(await findDuplicatePlaces(trip.id, { name: 'senso-ji  temple', categoryId: 'attraction', isVisited: false })).toHaveLength(1)
    expect(
      await findDuplicatePlaces(trip.id, { name: 'Asakusa temple', categoryId: 'attraction', isVisited: false, latitude: 35.71482, longitude: 139.79672 }),
    ).toHaveLength(1)
    expect(await findDuplicatePlaces(trip.id, { name: 'Tokyo Tower', categoryId: 'attraction', isVisited: false })).toHaveLength(0)
  })

  it('unlinks activities, shopping items and bookings when deleted', async () => {
    const { trip, days } = await makeTrip()
    const place = await createPlace(trip.id, { name: 'Don Quijote', categoryId: 'shopping', isVisited: false })
    const activity = await createActivity(trip.id, { tripDayId: days[0].id, placeId: place.id, title: 'Shop', status: 'planned' })
    const item = await createShoppingItem(trip.id, { name: 'Snacks', quantity: 1, purchasedQuantity: 0, currency: 'JPY', priority: 'low', cancelled: false, shopPlaceId: place.id })
    const booking = await createBooking(trip.id, { type: 'other', title: 'Tax refund', placeId: place.id })
    const usage = await deletePlace(place.id)
    expect(usage).toEqual({ activities: 1, shoppingItems: 1, bookings: 1 })
    expect((await db.activities.get(activity.id))?.placeId).toBeNull()
    expect((await db.shopping_items.get(item.id))?.shopPlaceId).toBeNull()
    expect((await db.bookings.get(booking.id))?.placeId).toBeNull()
    expect(isReportClean(await checkIntegrity())).toBe(true)
  })
})

describe('categories', () => {
  it('seeds system categories that cannot be deleted', async () => {
    expect((await db.categories.toArray()).filter((c) => c.isSystem)).toHaveLength(7)
    await expect(deleteCategory('restaurant')).rejects.toBeInstanceOf(AppError)
  })

  it('reassigns places before deleting a custom category', async () => {
    const { trip } = await makeTrip()
    const onsen = await createCategory({ name: 'Onsen', icon: 'waves', color: '#1f8a7a' })
    const place = await createPlace(trip.id, { name: 'Oedo Onsen', categoryId: onsen.id, isVisited: false })
    expect(place.category).toBe('other')
    expect(await countCategoryUsage(onsen.id)).toBe(1)
    expect(await deleteCategory(onsen.id)).toBe(1)
    expect(await db.places.get(place.id)).toMatchObject({ categoryId: 'other', category: 'other' })
    expect(await db.categories.get(onsen.id)).toBeUndefined()
  })
})

describe('bookings', () => {
  it('supports different departure and arrival time zones and rejects arrivals before departure', async () => {
    const { trip } = await makeTrip()
    const flight = await createBooking(trip.id, {
      type: 'flight',
      title: 'BKK → HND',
      startLocalDateTime: '2026-11-09T22:30',
      startTimezone: 'Asia/Bangkok',
      endLocalDateTime: '2026-11-10T06:40',
      endTimezone: 'Asia/Tokyo',
    })
    expect(flight.endTimezone).toBe('Asia/Tokyo')
    // 08:00 Tokyo is 06:00 Bangkok — earlier than a 07:00 Bangkok departure.
    await expect(
      createBooking(trip.id, {
        type: 'flight',
        title: 'Bad',
        startLocalDateTime: '2026-11-09T07:00',
        startTimezone: 'Asia/Bangkok',
        endLocalDateTime: '2026-11-09T08:00',
        endTimezone: 'Asia/Tokyo',
      }),
    ).rejects.toMatchObject({ issues: [{ path: 'endLocalDateTime', message: 'v.endBeforeStart' }] })
  })

  it('defaults missing time zones to the trip time zone', async () => {
    const { trip } = await makeTrip()
    const hotel = await createBooking(trip.id, { type: 'hotel', title: 'Hotel', startLocalDateTime: '2026-11-10T15:00', endLocalDateTime: '2026-11-14T11:00' })
    expect(hotel).toMatchObject({ startTimezone: 'Asia/Tokyo', endTimezone: 'Asia/Tokyo' })
  })
})
