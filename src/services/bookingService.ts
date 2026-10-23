import { db } from '@/db/database'
import { bookingSchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Booking, BookingType } from '@/types/entities'
import { IntegrityError, NotFoundError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { buildAttachment, deleteOwnerAttachments, type NewFile } from './attachmentService'
import { insertPlace, PLACE_WRITE_TABLES, type PlaceInput } from './placeService'

export interface BookingInput {
  type: BookingType
  title: string
  provider?: string
  bookingReference?: string
  startLocalDateTime?: string
  endLocalDateTime?: string
  startTimezone?: string
  endTimezone?: string
  origin?: string
  destination?: string
  flightNumber?: string
  terminal?: string
  address?: string
  placeId?: string | null
  notes?: string
}

const EMPTY_FIELDS: Partial<Booking> = {
  provider: undefined,
  bookingReference: undefined,
  startLocalDateTime: undefined,
  endLocalDateTime: undefined,
  startTimezone: undefined,
  endTimezone: undefined,
  origin: undefined,
  destination: undefined,
  flightNumber: undefined,
  terminal: undefined,
  address: undefined,
  notes: undefined,
}

const WRITE_TABLES = () => [db.trips, db.bookings, db.attachments, ...PLACE_WRITE_TABLES()]

/**
 * Times are local to where they happen. Missing zones default to the trip zone, and the end
 * zone defaults to the start zone (a flight can still set a different arrival zone).
 */
function withTimezones(input: BookingInput, tripTz: string): BookingInput {
  const startTimezone = input.startTimezone || tripTz
  return {
    ...input,
    startTimezone: input.startLocalDateTime ? startTimezone : undefined,
    endTimezone: input.endLocalDateTime ? input.endTimezone || startTimezone : undefined,
  }
}

async function resolvePlace(tripId: string, placeId: string | null | undefined, newPlace?: PlaceInput): Promise<string | null> {
  if (newPlace) return (await insertPlace(tripId, newPlace)).id
  if (!placeId) return null
  const place = await db.places.get(placeId)
  if (!place || place.tripId !== tripId) throw new IntegrityError('error.invalidPlace')
  return place.id
}

export async function createBooking(
  tripId: string,
  input: BookingInput,
  options: { newPlace?: PlaceInput; files?: NewFile[] } = {},
): Promise<Booking> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    const trip = await db.trips.get(tripId)
    if (!trip) throw new NotFoundError('trip')
    const ts = nowIso()
    const placeId = await resolvePlace(tripId, input.placeId, options.newPlace)
    const booking = validate(bookingSchema, {
      ...withTimezones(input, trip.timezone),
      id: newId(),
      tripId,
      placeId,
      createdAt: ts,
      updatedAt: ts,
    })
    await db.bookings.add(booking)
    if (options.files?.length) {
      await db.attachments.bulkAdd(options.files.map((f) => buildAttachment(tripId, 'booking', booking.id, f)))
    }
    return booking
  })
}

export async function updateBooking(
  id: string,
  input: BookingInput,
  options: { newPlace?: PlaceInput; files?: NewFile[] } = {},
): Promise<Booking> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    const existing = await db.bookings.get(id)
    if (!existing) throw new NotFoundError('booking')
    const trip = await db.trips.get(existing.tripId)
    const placeId = await resolvePlace(existing.tripId, input.placeId, options.newPlace)
    const booking = validate(bookingSchema, {
      ...existing,
      ...EMPTY_FIELDS,
      ...withTimezones(input, trip?.timezone ?? 'UTC'),
      placeId,
      updatedAt: nowIso(),
    })
    await db.bookings.put(booking)
    if (options.files?.length) {
      await db.attachments.bulkAdd(options.files.map((f) => buildAttachment(existing.tripId, 'booking', id, f)))
    }
    return booking
  })
}

export async function deleteBooking(id: string): Promise<void> {
  await db.transaction('rw', [db.bookings, db.attachments], async () => {
    await deleteOwnerAttachments('booking', id)
    await db.bookings.delete(id)
  })
}
