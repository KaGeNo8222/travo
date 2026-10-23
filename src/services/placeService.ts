import { db } from '@/db/database'
import { getPlaceUsage, type PlaceUsage } from '@/db/repositories/placeRepository'
import { placeSchema } from '@/db/schema'
import { isSystemCategoryId } from '@/db/seed'
import { validate } from '@/db/validate'
import type { Place, PlaceCategory } from '@/types/entities'
import { NotFoundError, ValidationError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { distanceMeters, extractPlaceId, isValidCoordinates, normalizeMapsUrl } from '@/utils/maps'
import { deleteOwnerAttachments } from './attachmentService'

export interface PlaceInput {
  name: string
  categoryId: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  googleMapsUrl?: string
  googlePlaceId?: string
  openingHoursNote?: string
  estimatedVisitMinutes?: number
  notes?: string
  isVisited: boolean
}

/** Tables a transaction needs when it may create a place. */
export const PLACE_WRITE_TABLES = () => [db.places, db.categories]

async function resolveCategory(categoryId: string): Promise<{ categoryId: string; category: PlaceCategory }> {
  if (isSystemCategoryId(categoryId)) return { categoryId, category: categoryId }
  const custom = await db.categories.get(categoryId)
  return custom ? { categoryId: custom.id, category: 'other' } : { categoryId: 'other', category: 'other' }
}

function normalizeLinks(input: PlaceInput): Pick<Place, 'googleMapsUrl' | 'googlePlaceId'> {
  const raw = input.googleMapsUrl?.trim()
  if (!raw) return { googleMapsUrl: undefined, googlePlaceId: input.googlePlaceId?.trim() || undefined }
  const url = normalizeMapsUrl(raw)
  if (!url) throw new ValidationError([{ path: 'googleMapsUrl', message: 'v.invalidMapsUrl' }])
  return { googleMapsUrl: url, googlePlaceId: input.googlePlaceId?.trim() || extractPlaceId(url) || undefined }
}

async function buildPlace(tripId: string, input: PlaceInput, base: Partial<Place> & { id: string; createdAt: string }): Promise<Place> {
  const ts = nowIso()
  const wasVisited = base.isVisited ?? false
  return validate(placeSchema, {
    ...base,
    ...input,
    ...(await resolveCategory(input.categoryId)),
    ...normalizeLinks(input),
    tripId,
    visitedAt: input.isVisited ? (wasVisited ? (base.visitedAt ?? ts) : ts) : null,
    updatedAt: ts,
  })
}

/** Creates a place. Call inside a transaction that includes PLACE_WRITE_TABLES. */
export async function insertPlace(tripId: string, input: PlaceInput): Promise<Place> {
  const place = await buildPlace(tripId, input, { id: newId(), createdAt: nowIso() })
  await db.places.add(place)
  return place
}

export async function createPlace(tripId: string, input: PlaceInput): Promise<Place> {
  return db.transaction('rw', [db.trips, ...PLACE_WRITE_TABLES()], async () => {
    if (!(await db.trips.get(tripId))) throw new NotFoundError('trip')
    return insertPlace(tripId, input)
  })
}

export async function updatePlace(id: string, input: PlaceInput): Promise<Place> {
  return db.transaction('rw', PLACE_WRITE_TABLES(), async () => {
    const existing = await db.places.get(id)
    if (!existing) throw new NotFoundError('place')
    const place = await buildPlace(existing.tripId, input, existing)
    await db.places.put(place)
    return place
  })
}

export async function setPlaceVisited(id: string, visited: boolean): Promise<void> {
  const ts = nowIso()
  const updated = await db.places.update(id, { isVisited: visited, visitedAt: visited ? ts : null, updatedAt: ts })
  if (!updated) throw new NotFoundError('place')
}

/**
 * Deletes a place. Activities, shopping items and bookings that referenced it are kept and
 * simply unlinked, so no record is left pointing at a missing place.
 */
export async function deletePlace(id: string): Promise<PlaceUsage> {
  return db.transaction(
    'rw',
    [db.places, db.activities, db.shopping_items, db.bookings, db.attachments],
    async () => {
      const usage = await getPlaceUsage(id)
      const ts = nowIso()
      await db.activities.where('placeId').equals(id).modify({ placeId: null, updatedAt: ts })
      await db.shopping_items.where('shopPlaceId').equals(id).modify({ shopPlaceId: null, updatedAt: ts })
      await db.bookings.where('placeId').equals(id).modify({ placeId: null, updatedAt: ts })
      await deleteOwnerAttachments('place', id)
      await db.places.delete(id)
      return usage
    },
  )
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '')
}

/** Places in the same trip that look like the same location (name, link, id or ~30 m). */
export async function findDuplicatePlaces(tripId: string, input: PlaceInput, excludeId?: string): Promise<Place[]> {
  const places = await db.places.where('tripId').equals(tripId).toArray()
  const name = normalizeName(input.name)
  const url = input.googleMapsUrl ? normalizeMapsUrl(input.googleMapsUrl) : null
  const placeId = input.googlePlaceId || (url ? extractPlaceId(url) : null)
  const coords =
    typeof input.latitude === 'number' && typeof input.longitude === 'number' && isValidCoordinates(input.latitude, input.longitude)
      ? { latitude: input.latitude, longitude: input.longitude }
      : null
  return places.filter((p) => {
    if (p.id === excludeId) return false
    if (name && normalizeName(p.name) === name) return true
    if (url && p.googleMapsUrl === url) return true
    if (placeId && p.googlePlaceId === placeId) return true
    if (coords && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
      return distanceMeters(coords, { latitude: p.latitude, longitude: p.longitude }) < 30
    }
    return false
  })
}
