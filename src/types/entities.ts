// Persisted entity shapes. Runtime validation lives in src/db/schema.ts.

export const TRIP_STATUSES = ['planning', 'upcoming', 'ongoing', 'completed', 'archived'] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export interface Trip {
  id: string
  name: string
  destinationCountry: string
  destinationCities: string[]
  /** Local calendar date, YYYY-MM-DD. */
  startDate: string
  /** Local calendar date, YYYY-MM-DD. */
  endDate: string
  /** IANA time zone used for "today" and itinerary times. */
  timezone: string
  coverImageId?: string | null
  /** Stored, user-chosen status. Use getDisplayStatus() for what to show. */
  status: TripStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TripDay {
  id: string
  tripId: string
  date: string
  dayOrder: number
  title?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export const PLACE_CATEGORIES = [
  'attraction',
  'restaurant',
  'cafe',
  'shopping',
  'hotel',
  'transport',
  'other',
] as const
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export interface Place {
  id: string
  tripId: string
  name: string
  /** Category record id. System categories use the PlaceCategory value as id. */
  categoryId?: string | null
  /** Base category type; custom categories map to "other". */
  category: PlaceCategory
  address?: string
  latitude?: number | null
  longitude?: number | null
  /** The user's original Google Maps link, preserved as entered. */
  googleMapsUrl?: string
  googlePlaceId?: string
  openingHoursNote?: string
  estimatedVisitMinutes?: number
  notes?: string
  isVisited: boolean
  visitedAt?: string | null
  createdAt: string
  updatedAt: string
}

export const ACTIVITY_STATUSES = ['planned', 'completed', 'skipped'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const TRANSPORT_MODES = ['walking', 'driving', 'transit', 'train', 'other'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export const ACTIVITY_TYPES = [
  'sightseeing',
  'food',
  'shopping',
  'transport',
  'experience',
  'rest',
  'other',
] as const

export interface Activity {
  id: string
  tripId: string
  tripDayId: string
  placeId?: string | null
  title: string
  /** Local wall-clock time, HH:mm. */
  startTime?: string
  /** Local wall-clock time, HH:mm. Earlier than startTime means it ends after midnight. */
  endTime?: string
  sortOrder: number
  activityType?: string
  /** How to get to this activity. */
  transportMode?: TransportMode
  /** Manually entered travel time in minutes; never estimated by the app. */
  travelMinutes?: number
  notes?: string
  status: ActivityStatus
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export const SHOPPING_STATUSES = ['to_buy', 'purchased', 'cancelled'] as const
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number]

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface ShoppingItem {
  id: string
  tripId: string
  name: string
  description?: string
  imageId?: string | null
  quantity: number
  purchasedQuantity: number
  estimatedUnitPrice?: number | null
  actualUnitPrice?: number | null
  currency: string
  shopPlaceId?: string | null
  recipient?: string
  priority: Priority
  /** "purchased" only when purchasedQuantity === quantity; partial purchases stay "to_buy". */
  status: ShoppingStatus
  /** Time of the most recent purchase update; null when nothing is purchased. */
  purchasedAt?: string | null
  notes?: string
  createdAt: string
  updatedAt: string
}

export const BOOKING_TYPES = ['flight', 'hotel', 'train', 'transport', 'attraction', 'other'] as const
export type BookingType = (typeof BOOKING_TYPES)[number]

export interface Booking {
  id: string
  tripId: string
  type: BookingType
  title: string
  provider?: string
  bookingReference?: string
  /** Local date-time at the start location, YYYY-MM-DDTHH:mm. */
  startLocalDateTime?: string
  /** Local date-time at the end location, YYYY-MM-DDTHH:mm. */
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
  createdAt: string
  updatedAt: string
}

export const ATTACHMENT_OWNER_TYPES = ['trip', 'place', 'activity', 'shopping', 'booking'] as const
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number]

export interface Attachment {
  id: string
  tripId: string
  ownerType: AttachmentOwnerType
  ownerId: string
  filename: string
  mimeType: string
  size: number
  blob: Blob
  createdAt: string
}

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'accommodation',
  'shopping',
  'activity',
  'other',
] as const

export interface Expense {
  id: string
  tripId: string
  activityId?: string | null
  /** When set, this expense replaces the item's computed spending (no double counting). */
  shoppingItemId?: string | null
  description: string
  amount: number
  currency: string
  /** Explicit user-provided rate for this expense. Null means "use the trip rate". */
  exchangeRateToTHB?: number | null
  /** THB value computed from the effective rate; null when no rate is known. */
  amountTHB?: number | null
  expenseDate: string
  category: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  sortOrder: number
  isSystem: boolean
}

export interface TripSettings {
  tripId: string
  /** Local currency of the destination; default for new expenses and items. */
  baseCurrency: string
  /** Currency used for totals: THB or the base currency. */
  displayCurrency: string
  budgetAmount?: number | null
  /** Currency of budgetAmount. */
  budgetCurrency?: string | null
  /** User-provided rate: 1 unit of baseCurrency = X THB. */
  exchangeRateToTHB?: number | null
  /** User-provided rates for other currencies used on the trip: code -> THB per unit. */
  otherRatesToTHB?: Record<string, number>
  updatedAt: string
}

export interface AppSettings {
  key: string
  value: unknown
  updatedAt: string
}
