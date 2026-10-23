import { listTripDays } from '@/db/repositories/tripRepository'
import { createTrip, type TripInput } from '@/services/tripService'

export function tripInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: 'Tokyo test',
    destinationCountry: 'Japan',
    destinationCities: ['Tokyo'],
    startDate: '2026-11-10',
    endDate: '2026-11-14',
    timezone: 'Asia/Tokyo',
    status: 'planning',
    ...overrides,
  }
}

export async function makeTrip(overrides: Partial<TripInput> = {}, baseCurrency = 'JPY') {
  const trip = await createTrip(tripInput(overrides), { baseCurrency })
  const days = await listTripDays(trip.id)
  return { trip, days }
}

export function pngBlob(bytes = 64): Blob {
  const data = new Uint8Array(bytes)
  data.set([0x89, 0x50, 0x4e, 0x47])
  return new Blob([data], { type: 'image/png' })
}
