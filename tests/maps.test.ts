// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildDirectionsUrl,
  buildPlaceUrl,
  buildSearchUrl,
  extractCoordinates,
  extractPlaceId,
  isShortMapsLink,
  normalizeMapsUrl,
} from '@/utils/maps'

const place = { name: 'Senso-ji', address: 'Asakusa, Tokyo', latitude: null, longitude: null }

describe('Google Maps links', () => {
  it('accepts Google Maps URLs and preserves the original text', () => {
    const original = 'https://www.google.com/maps/place/Senso-ji/@35.7147651,139.7966553,17z'
    expect(normalizeMapsUrl(original)).toBe(original)
    expect(normalizeMapsUrl('https://maps.app.goo.gl/AbC123xyz')).toBe('https://maps.app.goo.gl/AbC123xyz')
    expect(normalizeMapsUrl('https://www.google.co.th/maps/search/?api=1&query=x')).not.toBeNull()
    expect(normalizeMapsUrl('maps.google.com/?q=35.1,139.2')).toBe('https://maps.google.com/?q=35.1,139.2')
  })

  it('rejects non-Maps and unsafe URLs', () => {
    expect(normalizeMapsUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeMapsUrl('https://evil.example.com/maps')).toBeNull()
    expect(normalizeMapsUrl('https://www.google.com/search?q=tokyo')).toBeNull()
    expect(normalizeMapsUrl('https://user:pw@www.google.com/maps')).toBeNull()
    expect(normalizeMapsUrl('')).toBeNull()
  })

  it('reads coordinates written in the link, preferring the place pin', () => {
    expect(extractCoordinates('https://www.google.com/maps/place/X/@35.1,139.1,17z/data=!3d35.7147651!4d139.7966553')).toEqual({
      latitude: 35.7147651,
      longitude: 139.7966553,
    })
    expect(extractCoordinates('https://www.google.com/maps/@13.7563,100.5018,15z')).toEqual({ latitude: 13.7563, longitude: 100.5018 })
    expect(extractCoordinates('https://maps.google.com/?q=-33.8568,151.2153')).toEqual({ latitude: -33.8568, longitude: 151.2153 })
  })

  it('never invents coordinates for short links or out-of-range values', () => {
    expect(extractCoordinates('https://maps.app.goo.gl/AbC123xyz')).toBeNull()
    expect(extractCoordinates('https://www.google.com/maps/@95.0,200.0,15z')).toBeNull()
    expect(isShortMapsLink('https://maps.app.goo.gl/AbC123xyz')).toBe(true)
  })

  it('extracts place ids', () => {
    expect(extractPlaceId('https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJ8T1GpMGOGGARDYGSgpooDWw')).toBe(
      'ChIJ8T1GpMGOGGARDYGSgpooDWw',
    )
  })

  it('builds official api=1 URLs', () => {
    expect(buildSearchUrl(place)).toBe('https://www.google.com/maps/search/?api=1&query=Senso-ji%2C+Asakusa%2C+Tokyo')
    expect(buildSearchUrl({ ...place, latitude: 35.71, longitude: 139.79 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=35.71%2C139.79',
    )
    expect(buildDirectionsUrl({ ...place, latitude: 35.71, longitude: 139.79 }, 'walking')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=35.71%2C139.79&travelmode=walking',
    )
    expect(buildDirectionsUrl(place, 'train')).toContain('travelmode=transit')
  })

  it('opens the user link as-is and falls back to it for directions without data', () => {
    const link = 'https://maps.app.goo.gl/AbC123xyz'
    expect(buildPlaceUrl({ ...place, googleMapsUrl: link })).toBe(link)
    expect(buildDirectionsUrl({ name: 'X', address: undefined, latitude: null, longitude: null, googleMapsUrl: link })).toBe(link)
  })
})
