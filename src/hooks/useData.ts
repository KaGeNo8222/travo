import { useLiveQuery } from 'dexie-react-hooks'
import { listActivitiesByTrip } from '@/db/repositories/activityRepository'
import { getAttachment, listAttachmentsByOwner } from '@/db/repositories/attachmentRepository'
import { listBookings } from '@/db/repositories/bookingRepository'
import { listCategories } from '@/db/repositories/categoryRepository'
import { listExpenses } from '@/db/repositories/expenseRepository'
import { listPlacesByTrip } from '@/db/repositories/placeRepository'
import { getAllSettings } from '@/db/repositories/settingsRepository'
import { listShoppingItems } from '@/db/repositories/shoppingRepository'
import { getTrip, getTripSettings, listTripDays, listTrips } from '@/db/repositories/tripRepository'
import type { AttachmentOwnerType } from '@/types/entities'

// Live queries re-run automatically whenever the underlying tables change.
// `undefined` means "still loading"; `null` means "not found".

export const useAppSettings = () => useLiveQuery(getAllSettings, [])

export const useTrips = () => useLiveQuery(listTrips, [])

export const useTrip = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await getTrip(id)) ?? null) : null), [id])

export const useTripDays = (tripId: string) => useLiveQuery(() => listTripDays(tripId), [tripId])

export const useTripSettings = (tripId: string) =>
  useLiveQuery(async () => (await getTripSettings(tripId)) ?? null, [tripId])

export const useActivities = (tripId: string) => useLiveQuery(() => listActivitiesByTrip(tripId), [tripId])

export const usePlaces = (tripId: string) => useLiveQuery(() => listPlacesByTrip(tripId), [tripId])

export const useShoppingItems = (tripId: string) => useLiveQuery(() => listShoppingItems(tripId), [tripId])

export const useBookings = (tripId: string, tripTz: string) =>
  useLiveQuery(() => listBookings(tripId, tripTz), [tripId, tripTz])

export const useExpenses = (tripId: string) => useLiveQuery(() => listExpenses(tripId), [tripId])

export const useCategories = () => useLiveQuery(listCategories, [])

export const useAttachment = (id: string | null | undefined) =>
  useLiveQuery(async () => (id ? ((await getAttachment(id)) ?? null) : null), [id])

export const useOwnerAttachments = (ownerType: AttachmentOwnerType, ownerId: string | undefined) =>
  useLiveQuery(async () => (ownerId ? listAttachmentsByOwner(ownerType, ownerId) : []), [ownerType, ownerId])
