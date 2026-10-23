import type { Place, TransportMode } from '@/types/entities'

// Google Maps integration through official Maps URLs — no API key, no geocoding.
// https://developers.google.com/maps/documentation/urls/get-started

const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i
const MAPS_SUBDOMAIN = /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/i

/**
 * Validates a Google Maps link. Returns the URL to store — the user's original text when it
 * is already a well-formed https link, otherwise a normalized https version — or null.
 */
export function normalizeMapsUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw || raw.length > 2048) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  const allowed =
    (GOOGLE_HOST.test(host) && path.startsWith('/maps')) ||
    MAPS_SUBDOMAIN.test(host) ||
    host === 'maps.app.goo.gl' ||
    (host === 'goo.gl' && path.startsWith('/maps'))
  if (!allowed) return null
  if (url.protocol === 'https:' && /^https:\/\//i.test(raw)) return raw
  url.protocol = 'https:'
  return url.toString()
}

export function isShortMapsLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'maps.app.goo.gl' || host === 'goo.gl'
  } catch {
    return false
  }
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  )
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'
// Ordered by reliability: the place pin (!3d!4d) beats explicit query params, which beat
// the "@lat,lng" map viewport centre.
const COORD_PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=${NUM},\\s*${NUM}(?:[&#]|$)`),
  new RegExp(`/place/${NUM},\\s*${NUM}(?:[/?]|$)`),
  new RegExp(`@${NUM},${NUM}`),
]

/**
 * Reads coordinates written literally inside a Maps URL. Short links (maps.app.goo.gl) carry
 * no coordinates and are never resolved — this function does not geocode.
 */
export function extractCoordinates(url: string): Coordinates | null {
  let text = url
  try {
    text = decodeURIComponent(url)
  } catch {
    // keep raw text
  }
  for (const re of COORD_PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    const latitude = Number(m[1])
    const longitude = Number(m[2])
    if (isValidCoordinates(latitude, longitude)) return { latitude, longitude }
  }
  return null
}

export function extractPlaceId(url: string): string | null {
  const m = /(?:query_place_id=|destination_place_id=|place_id:)([A-Za-z0-9_-]{10,})/.exec(url)
  return m ? m[1] : null
}

type MapsTarget = Pick<
  Place,
  'name' | 'address' | 'latitude' | 'longitude' | 'googleMapsUrl' | 'googlePlaceId'
>

function hasCoords(p: MapsTarget): p is MapsTarget & { latitude: number; longitude: number } {
  return (
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    isValidCoordinates(p.latitude, p.longitude)
  )
}

function textQuery(p: MapsTarget): string {
  return [p.name, p.address].filter((s) => s && s.trim()).join(', ')
}

/** Search URL built from the place's own data (official `api=1` pattern). */
export function buildSearchUrl(p: MapsTarget): string {
  const params = new URLSearchParams({ api: '1' })
  params.set('query', hasCoords(p) ? `${p.latitude},${p.longitude}` : textQuery(p))
  if (p.googlePlaceId) params.set('query_place_id', p.googlePlaceId)
  return `https://www.google.com/maps/search/?${params.toString()}`
}

/** Opens the place: the user's original link is preferred and preserved as-is. */
export function buildPlaceUrl(p: MapsTarget): string {
  return p.googleMapsUrl || buildSearchUrl(p)
}

const TRAVEL_MODES: Partial<Record<TransportMode, string>> = {
  walking: 'walking',
  driving: 'driving',
  transit: 'transit',
  train: 'transit',
}

/**
 * Directions to the place from the user's current location. Without coordinates, address or
 * place id there is nothing reliable to route to, so the original link is opened instead.
 */
export function buildDirectionsUrl(p: MapsTarget, mode?: TransportMode): string {
  if (!hasCoords(p) && !p.address && !p.googlePlaceId && p.googleMapsUrl) return p.googleMapsUrl
  const params = new URLSearchParams({ api: '1' })
  params.set('destination', hasCoords(p) ? `${p.latitude},${p.longitude}` : textQuery(p))
  if (p.googlePlaceId) params.set('destination_place_id', p.googlePlaceId)
  const travelmode = mode ? TRAVEL_MODES[mode] : undefined
  if (travelmode) params.set('travelmode', travelmode)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function canOpenInMaps(p: MapsTarget | null | undefined): boolean {
  return !!p && (!!p.googleMapsUrl || hasCoords(p) || !!p.name.trim())
}

/** Distance in metres between two coordinates (haversine). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
