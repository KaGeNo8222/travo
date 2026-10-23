import { z } from 'zod'
import {
  ACTIVITY_STATUSES,
  ATTACHMENT_OWNER_TYPES,
  BOOKING_TYPES,
  PLACE_CATEGORIES,
  PRIORITIES,
  SHOPPING_STATUSES,
  TRANSPORT_MODES,
  TRIP_STATUSES,
  type Activity,
  type AppSettings,
  type Attachment,
  type Booking,
  type Category,
  type Expense,
  type Place,
  type ShoppingItem,
  type Trip,
  type TripDay,
  type TripSettings,
} from '@/types/entities'
import { isSupportedCurrency } from '@/utils/currency'
import { MAX_ATTACHMENT_BYTES, isAllowedMimeType } from '@/utils/files'
import { normalizeMapsUrl } from '@/utils/maps'
import { MAX_AMOUNT } from '@/utils/money'
import {
  MAX_TRIP_DAYS,
  daysBetween,
  isValidDateString,
  isValidLocalDateTime,
  isValidTimeString,
  isValidTimeZone,
  localDateTimeToInstant,
} from '@/utils/time'

// Validation messages are i18n keys ("v.*"), translated by the UI.

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const opt = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional())

const id = z.string({ error: 'v.required' }).min(1, 'v.required').max(100, 'v.tooLong')
const nullableId = z.preprocess(emptyToNull, id.nullable().optional())
const text = (max: number) => z.string({ error: 'v.required' }).trim().max(max, 'v.tooLong')
const requiredText = (max: number) => text(max).min(1, 'v.required')
const optionalText = (max: number) => opt(text(max))
const num = () => z.number({ error: 'v.number' })
const int = () => num().int('v.integer')

export const timestampSchema = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)), 'v.invalidTimestamp')
const nullableTimestamp = z.preprocess(emptyToNull, timestampSchema.nullable().optional())
export const dateSchema = z.string({ error: 'v.required' }).refine(isValidDateString, 'v.invalidDate')
export const timeSchema = z.string().refine(isValidTimeString, 'v.invalidTime')
const localDateTimeSchema = z.string().refine(isValidLocalDateTime, 'v.invalidDateTime')
export const timezoneSchema = z.string({ error: 'v.required' }).refine(isValidTimeZone, 'v.invalidTimezone')
export const currencySchema = z.string({ error: 'v.required' }).refine(isSupportedCurrency, 'v.invalidCurrency')
const money = () => num().min(0, 'v.nonNegative').max(MAX_AMOUNT, 'v.tooLarge')
const optionalMoney = () => z.preprocess(emptyToNull, money().nullable().optional())
export const rateSchema = num().positive('v.positive').max(1_000_000, 'v.tooLarge')

export const tripSchema = z
  .object({
    id,
    name: requiredText(120),
    destinationCountry: requiredText(80),
    destinationCities: z.array(requiredText(80)).max(30, 'v.tooMany'),
    startDate: dateSchema,
    endDate: dateSchema,
    timezone: timezoneSchema,
    coverImageId: nullableId,
    status: z.enum(TRIP_STATUSES),
    notes: optionalText(5000),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((t, ctx) => {
    if (!isValidDateString(t.startDate) || !isValidDateString(t.endDate)) return
    if (t.endDate < t.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'v.endBeforeStart' })
    } else if (daysBetween(t.startDate, t.endDate) + 1 > MAX_TRIP_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'v.tooManyDays' })
    }
  }) satisfies z.ZodType<Trip>

export const tripDaySchema = z.object({
  id,
  tripId: id,
  date: dateSchema,
  dayOrder: int().min(1),
  title: optionalText(120),
  notes: optionalText(5000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}) satisfies z.ZodType<TripDay>

export const placeSchema = z
  .object({
    id,
    tripId: id,
    name: requiredText(160),
    categoryId: nullableId,
    category: z.enum(PLACE_CATEGORIES),
    address: optionalText(500),
    latitude: z.preprocess(emptyToNull, num().min(-90, 'v.latitude').max(90, 'v.latitude').nullable().optional()),
    longitude: z.preprocess(
      emptyToNull,
      num().min(-180, 'v.longitude').max(180, 'v.longitude').nullable().optional(),
    ),
    googleMapsUrl: opt(z.string().max(2048, 'v.tooLong').refine((v) => normalizeMapsUrl(v) !== null, 'v.invalidMapsUrl')),
    googlePlaceId: optionalText(300),
    openingHoursNote: optionalText(500),
    estimatedVisitMinutes: opt(int().min(0, 'v.nonNegative').max(10080, 'v.tooLarge')),
    notes: optionalText(5000),
    isVisited: z.boolean(),
    visitedAt: nullableTimestamp,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((p, ctx) => {
    const hasLat = typeof p.latitude === 'number'
    const hasLng = typeof p.longitude === 'number'
    if (hasLat !== hasLng) {
      ctx.addIssue({ code: 'custom', path: [hasLat ? 'longitude' : 'latitude'], message: 'v.coordsPair' })
    }
  }) satisfies z.ZodType<Place>

export const activitySchema = z
  .object({
    id,
    tripId: id,
    tripDayId: id,
    placeId: nullableId,
    title: requiredText(200),
    startTime: opt(timeSchema),
    endTime: opt(timeSchema),
    sortOrder: int(),
    activityType: optionalText(40),
    transportMode: opt(z.enum(TRANSPORT_MODES)),
    travelMinutes: opt(int().min(0, 'v.nonNegative').max(1440, 'v.tooLarge')),
    notes: optionalText(5000),
    status: z.enum(ACTIVITY_STATUSES),
    completedAt: nullableTimestamp,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((a, ctx) => {
    if (a.endTime && !a.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'v.endWithoutStart' })
    } else if (a.endTime && a.endTime === a.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'v.endEqualsStart' })
    }
  }) satisfies z.ZodType<Activity>

export const shoppingItemSchema = z
  .object({
    id,
    tripId: id,
    name: requiredText(160),
    description: optionalText(1000),
    imageId: nullableId,
    quantity: int().min(1, 'v.quantityPositive').max(9999, 'v.tooLarge'),
    purchasedQuantity: int().min(0, 'v.nonNegative').max(9999, 'v.tooLarge'),
    estimatedUnitPrice: optionalMoney(),
    actualUnitPrice: optionalMoney(),
    currency: currencySchema,
    shopPlaceId: nullableId,
    recipient: optionalText(80),
    priority: z.enum(PRIORITIES),
    status: z.enum(SHOPPING_STATUSES),
    purchasedAt: nullableTimestamp,
    notes: optionalText(5000),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((s, ctx) => {
    if (s.purchasedQuantity > s.quantity) {
      ctx.addIssue({ code: 'custom', path: ['purchasedQuantity'], message: 'v.purchasedExceeds' })
      return
    }
    if (s.status === 'cancelled') return
    const expected = s.purchasedQuantity >= s.quantity ? 'purchased' : 'to_buy'
    if (s.status !== expected) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'v.statusMismatch' })
    }
  }) satisfies z.ZodType<ShoppingItem>

export const bookingSchema = z
  .object({
    id,
    tripId: id,
    type: z.enum(BOOKING_TYPES),
    title: requiredText(200),
    provider: optionalText(120),
    bookingReference: optionalText(120),
    startLocalDateTime: opt(localDateTimeSchema),
    endLocalDateTime: opt(localDateTimeSchema),
    startTimezone: opt(timezoneSchema),
    endTimezone: opt(timezoneSchema),
    origin: optionalText(160),
    destination: optionalText(160),
    flightNumber: optionalText(20),
    terminal: optionalText(40),
    address: optionalText(500),
    placeId: nullableId,
    notes: optionalText(5000),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((b, ctx) => {
    if (!b.startLocalDateTime || !b.endLocalDateTime) return
    if (!isValidLocalDateTime(b.startLocalDateTime) || !isValidLocalDateTime(b.endLocalDateTime)) return
    const startTz = b.startTimezone ?? 'UTC'
    const endTz = b.endTimezone ?? startTz
    if (!isValidTimeZone(startTz) || !isValidTimeZone(endTz)) return
    const start = localDateTimeToInstant(b.startLocalDateTime, startTz).getTime()
    const end = localDateTimeToInstant(b.endLocalDateTime, endTz).getTime()
    if (end < start) {
      ctx.addIssue({ code: 'custom', path: ['endLocalDateTime'], message: 'v.endBeforeStart' })
    }
  }) satisfies z.ZodType<Booking>

const attachmentShape = {
  id,
  tripId: id,
  ownerType: z.enum(ATTACHMENT_OWNER_TYPES),
  ownerId: id,
  filename: requiredText(255),
  mimeType: z.string().refine(isAllowedMimeType, 'v.fileType'),
  size: int().min(0).max(MAX_ATTACHMENT_BYTES, 'v.fileTooLarge'),
  createdAt: timestampSchema,
}

export const attachmentSchema = z
  .object({ ...attachmentShape, blob: z.instanceof(Blob, { error: 'v.fileMissing' }) })
  .superRefine((a, ctx) => {
    if (a.blob.size !== a.size) ctx.addIssue({ code: 'custom', path: ['size'], message: 'v.sizeMismatch' })
  }) satisfies z.ZodType<Attachment>

/** Attachment metadata as stored in backups (the binary lives in its own zip entry). */
export const attachmentMetaSchema = z.object(attachmentShape)

export const expenseSchema = z.object({
  id,
  tripId: id,
  activityId: nullableId,
  shoppingItemId: nullableId,
  description: requiredText(200),
  amount: money(),
  currency: currencySchema,
  exchangeRateToTHB: z.preprocess(emptyToNull, rateSchema.nullable().optional()),
  amountTHB: z.preprocess(emptyToNull, num().min(0).nullable().optional()),
  expenseDate: dateSchema,
  category: requiredText(40),
  notes: optionalText(5000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}) satisfies z.ZodType<Expense>

export const categorySchema = z.object({
  id,
  name: requiredText(40),
  icon: requiredText(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'v.invalidColor'),
  sortOrder: int(),
  isSystem: z.boolean(),
}) satisfies z.ZodType<Category>

export const tripSettingsSchema = z
  .object({
    tripId: id,
    baseCurrency: currencySchema,
    displayCurrency: currencySchema,
    budgetAmount: optionalMoney(),
    budgetCurrency: z.preprocess(emptyToNull, currencySchema.nullable().optional()),
    exchangeRateToTHB: z.preprocess(emptyToNull, rateSchema.nullable().optional()),
    otherRatesToTHB: z.record(z.string(), rateSchema).optional(),
    updatedAt: timestampSchema,
  })
  .superRefine((s, ctx) => {
    for (const code of Object.keys(s.otherRatesToTHB ?? {})) {
      if (!isSupportedCurrency(code)) {
        ctx.addIssue({ code: 'custom', path: ['otherRatesToTHB', code], message: 'v.invalidCurrency' })
      }
    }
  }) satisfies z.ZodType<TripSettings>

export const appSettingsSchema = z.object({
  key: requiredText(80),
  value: z.unknown(),
  updatedAt: timestampSchema,
}) satisfies z.ZodType<AppSettings>
