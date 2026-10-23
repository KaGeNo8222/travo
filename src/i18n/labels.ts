import type {
  ActivityStatus,
  BookingType,
  Category,
  PlaceCategory,
  Priority,
  TransportMode,
  TripStatus,
} from '@/types/entities'
import { ACTIVITY_TYPES, EXPENSE_CATEGORIES } from '@/types/entities'
import type { ShoppingDisplayState } from '@/utils/shopping'
import type { I18n, TKey } from './index'

export const TRIP_STATUS_LABEL: Record<TripStatus, TKey> = {
  planning: 'tripStatus.planning',
  upcoming: 'tripStatus.upcoming',
  ongoing: 'tripStatus.ongoing',
  completed: 'tripStatus.completed',
  archived: 'tripStatus.archived',
}

export const PLACE_CATEGORY_LABEL: Record<PlaceCategory, TKey> = {
  attraction: 'placeCategory.attraction',
  restaurant: 'placeCategory.restaurant',
  cafe: 'placeCategory.cafe',
  shopping: 'placeCategory.shopping',
  hotel: 'placeCategory.hotel',
  transport: 'placeCategory.transport',
  other: 'placeCategory.other',
}

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, TKey> = {
  planned: 'activityStatus.planned',
  completed: 'activityStatus.completed',
  skipped: 'activityStatus.skipped',
}

export const TRANSPORT_MODE_LABEL: Record<TransportMode, TKey> = {
  walking: 'transport.walking',
  driving: 'transport.driving',
  transit: 'transport.transit',
  train: 'transport.train',
  other: 'transport.other',
}

export const ACTIVITY_TYPE_LABEL: Record<(typeof ACTIVITY_TYPES)[number], TKey> = {
  sightseeing: 'activityType.sightseeing',
  food: 'activityType.food',
  shopping: 'activityType.shopping',
  transport: 'activityType.transport',
  experience: 'activityType.experience',
  rest: 'activityType.rest',
  other: 'activityType.other',
}

export const BOOKING_TYPE_LABEL: Record<BookingType, TKey> = {
  flight: 'bookingType.flight',
  hotel: 'bookingType.hotel',
  train: 'bookingType.train',
  transport: 'bookingType.transport',
  attraction: 'bookingType.attraction',
  other: 'bookingType.other',
}

export const PRIORITY_LABEL: Record<Priority, TKey> = {
  high: 'priority.high',
  medium: 'priority.medium',
  low: 'priority.low',
}

export const EXPENSE_CATEGORY_LABEL: Record<(typeof EXPENSE_CATEGORIES)[number], TKey> = {
  food: 'expenseCategory.food',
  transport: 'expenseCategory.transport',
  accommodation: 'expenseCategory.accommodation',
  shopping: 'expenseCategory.shopping',
  activity: 'expenseCategory.activity',
  other: 'expenseCategory.other',
}

export const SHOPPING_STATE_LABEL: Record<ShoppingDisplayState, TKey> = {
  to_buy: 'shoppingState.to_buy',
  partial: 'shoppingState.partial',
  purchased: 'shoppingState.purchased',
  cancelled: 'shoppingState.cancelled',
}

function isKeyOf<T extends object>(map: T, key: string): key is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(map, key)
}

/** System categories are translated; custom ones show the user's own name. */
export function categoryLabel(category: Pick<Category, 'id' | 'name' | 'isSystem'>, i18n: I18n): string {
  if (category.isSystem && isKeyOf(PLACE_CATEGORY_LABEL, category.id)) return i18n.t(PLACE_CATEGORY_LABEL[category.id])
  return category.name
}

export function activityTypeLabel(type: string, i18n: I18n): string {
  return isKeyOf(ACTIVITY_TYPE_LABEL, type) ? i18n.t(ACTIVITY_TYPE_LABEL[type]) : type
}

export function expenseCategoryLabel(category: string, i18n: I18n): string {
  return isKeyOf(EXPENSE_CATEGORY_LABEL, category) ? i18n.t(EXPENSE_CATEGORY_LABEL[category]) : category
}
