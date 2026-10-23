import type JSZip from 'jszip'
import { z } from 'zod'
import { db } from '@/db/database'
import { SCHEMA_VERSION, TABLE_NAMES, migrateBackupTables, type RawTables, type TableName } from '@/db/migrations'
import { getSetting, setSetting } from '@/db/repositories/settingsRepository'
import {
  activitySchema,
  appSettingsSchema,
  attachmentMetaSchema,
  bookingSchema,
  categorySchema,
  expenseSchema,
  placeSchema,
  shoppingItemSchema,
  tripDaySchema,
  tripSchema,
  tripSettingsSchema,
} from '@/db/schema'
import { SYSTEM_CATEGORIES, isSystemCategoryId } from '@/db/seed'
import type {
  Activity,
  AppSettings,
  Attachment,
  Booking,
  Category,
  Expense,
  Place,
  ShoppingItem,
  Trip,
  TripDay,
  TripSettings,
} from '@/types/entities'
import { BackupError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { deriveShoppingStatus } from '@/utils/shopping'
import { enumerateDates } from '@/utils/time'
import { defaultTripSettings, deleteTrip } from './tripService'

// Backup layout (ZIP):
//   TRAVO_Backup/manifest.json   format/schema/app versions, export time, attachment metadata
//   TRAVO_Backup/database.json   all structured records (attachment binaries excluded)
//   TRAVO_Backup/attachments/<id> raw attachment bytes, stored uncompressed

export const BACKUP_FORMAT = 'travo-backup'
export const BACKUP_FORMAT_VERSION = 1
const ROOT = 'TRAVO_Backup'

export interface BackupAttachmentMeta extends Omit<Attachment, 'blob'> {
  path: string
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  backupFormatVersion: number
  schemaVersion: number
  appVersion: string
  exportedAt: string
  counts: Record<string, number>
  attachments: BackupAttachmentMeta[]
}

export interface BackupTables {
  trips: Trip[]
  trip_days: TripDay[]
  places: Place[]
  activities: Activity[]
  shopping_items: ShoppingItem[]
  bookings: Booking[]
  attachments: Attachment[]
  expenses: Expense[]
  categories: Category[]
  trip_settings: TripSettings[]
  app_settings: AppSettings[]
}

export interface ParsedBackup {
  manifest: BackupManifest
  tables: BackupTables
  /** Problems that were repaired automatically (e.g. a dangling optional link). */
  warnings: string[]
  attachmentBytes: number
}

/** JSZip is only needed for backup/restore, so it is loaded on demand. */
async function loadJSZip(): Promise<typeof JSZip> {
  return (await import('jszip')).default
}

function timestampForFilename(iso: string): string {
  return iso.slice(0, 19).replace(/[:T]/g, '-')
}

/** Builds the backup ZIP from one consistent read of the whole database. */
export async function createBackup(onProgress?: (percent: number) => void): Promise<{ file: File; manifest: BackupManifest }> {
  const snapshot = await db.transaction('r', db.allTables, async () => {
    const out: Record<string, unknown[]> = {}
    for (const name of TABLE_NAMES) out[name] = await db.table(name).toArray()
    return out
  })
  const attachments = snapshot.attachments as Attachment[]
  const JSZipCtor = await loadJSZip()
  const zip = new JSZipCtor()
  const root = zip.folder(ROOT)!
  const metas: BackupAttachmentMeta[] = []
  for (const att of attachments) {
    const path = `attachments/${att.id}`
    // Images are already compressed; storing avoids burning CPU and memory on the phone.
    root.file(path, await att.blob.arrayBuffer(), { binary: true, compression: 'STORE' })
    metas.push({
      id: att.id,
      tripId: att.tripId,
      ownerType: att.ownerType,
      ownerId: att.ownerId,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      createdAt: att.createdAt,
      path,
    })
  }

  const tables: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const name of TABLE_NAMES) {
    counts[name] = snapshot[name].length
    if (name !== 'attachments') tables[name] = snapshot[name]
  }
  root.file('database.json', JSON.stringify({ tables }), { compression: 'DEFLATE' })

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: __APP_VERSION__,
    exportedAt: nowIso(),
    counts,
    attachments: metas,
  }
  root.file('manifest.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' })

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }, (meta) => onProgress?.(meta.percent))
  const file = new File([blob], `TRAVO_Backup_${timestampForFilename(manifest.exportedAt)}.zip`, {
    type: 'application/zip',
  })
  await setSetting('backupMeta', { lastBackupAt: manifest.exportedAt, lastBackupBytes: file.size })
  return { file, manifest }
}

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  backupFormatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  exportedAt: z.string(),
  counts: z.record(z.string(), z.number()).optional(),
  attachments: z.array(z.looseObject({ id: z.string(), path: z.string() })),
})

const databaseJsonSchema = z.object({ tables: z.record(z.string(), z.array(z.unknown())) })

const TABLE_SCHEMAS: Record<Exclude<TableName, 'attachments'>, z.ZodType> = {
  trips: tripSchema,
  trip_days: tripDaySchema,
  places: placeSchema,
  activities: activitySchema,
  shopping_items: shoppingItemSchema,
  bookings: bookingSchema,
  expenses: expenseSchema,
  categories: categorySchema,
  trip_settings: tripSettingsSchema,
  app_settings: appSettingsSchema,
}

function parseJson(text: string, error: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new BackupError(error)
  }
}

function validateRecords<T>(table: string, records: unknown[], schema: z.ZodType, errors: string[]): T[] {
  const out: T[] = []
  records.forEach((record, i) => {
    let input = record
    // Repair a status that disagrees with the quantities instead of rejecting the backup.
    if (table === 'shopping_items' && record && typeof record === 'object') {
      const s = record as ShoppingItem
      if (typeof s.quantity === 'number' && typeof s.purchasedQuantity === 'number') {
        input = { ...s, status: deriveShoppingStatus(s.quantity, s.purchasedQuantity, s.status === 'cancelled') }
      }
    }
    const result = schema.safeParse(input)
    if (result.success) out.push(result.data as T)
    else {
      const issue = result.error.issues[0]
      errors.push(`${table}[${i}] ${issue.path.join('.')}: ${issue.message}`)
    }
  })
  return out
}

function findDuplicates(table: string, ids: string[], errors: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${table}: duplicate id ${id}`)
    seen.add(id)
  }
}

/** Checks references; required ones produce errors, optional dangling ones are cleared. */
function checkRelations(t: BackupTables, errors: string[], warnings: string[]): void {
  findDuplicates('trips', t.trips.map((x) => x.id), errors)
  findDuplicates('trip_days', t.trip_days.map((x) => x.id), errors)
  findDuplicates('places', t.places.map((x) => x.id), errors)
  findDuplicates('activities', t.activities.map((x) => x.id), errors)
  findDuplicates('shopping_items', t.shopping_items.map((x) => x.id), errors)
  findDuplicates('bookings', t.bookings.map((x) => x.id), errors)
  findDuplicates('attachments', t.attachments.map((x) => x.id), errors)
  findDuplicates('expenses', t.expenses.map((x) => x.id), errors)
  findDuplicates('categories', t.categories.map((x) => x.id), errors)

  const trips = new Set(t.trips.map((x) => x.id))
  const requireTrip = (table: string, rec: { id?: string; tripId: string }) => {
    if (!trips.has(rec.tripId)) errors.push(`${table} ${rec.id ?? rec.tripId}: unknown trip ${rec.tripId}`)
  }
  const dayDates = new Set<string>()
  for (const d of t.trip_days) {
    requireTrip('trip_days', d)
    const key = `${d.tripId}|${d.date}`
    if (dayDates.has(key)) errors.push(`trip_days: duplicate date ${d.date} in trip ${d.tripId}`)
    dayDates.add(key)
  }
  const days = new Map(t.trip_days.map((d) => [d.id, d]))
  const places = new Map(t.places.map((p) => [p.id, p]))
  const activities = new Map(t.activities.map((a) => [a.id, a]))
  const items = new Map(t.shopping_items.map((s) => [s.id, s]))
  const bookings = new Map(t.bookings.map((b) => [b.id, b]))
  const categories = new Set([...t.categories.map((c) => c.id), ...SYSTEM_CATEGORIES.map((c) => c.id)])
  const sameTrip = <R extends { tripId: string }>(map: Map<string, R>, id: string | null | undefined, tripId: string) =>
    !id || map.get(id)?.tripId === tripId

  for (const p of t.places) {
    requireTrip('places', p)
    if (p.categoryId && !categories.has(p.categoryId)) {
      warnings.push(`places ${p.id}: unknown category, set to "other"`)
      p.categoryId = 'other'
      p.category = 'other'
    }
  }
  for (const a of t.activities) {
    requireTrip('activities', a)
    if (!sameTrip(days, a.tripDayId, a.tripId)) errors.push(`activities ${a.id}: unknown day ${a.tripDayId}`)
    if (!sameTrip(places, a.placeId, a.tripId)) {
      warnings.push(`activities ${a.id}: missing place unlinked`)
      a.placeId = null
    }
  }
  for (const b of t.bookings) {
    requireTrip('bookings', b)
    if (!sameTrip(places, b.placeId, b.tripId)) {
      warnings.push(`bookings ${b.id}: missing place unlinked`)
      b.placeId = null
    }
  }
  for (const e of t.expenses) {
    requireTrip('expenses', e)
    if (!sameTrip(activities, e.activityId, e.tripId)) e.activityId = null
    if (!sameTrip(items, e.shoppingItemId, e.tripId)) e.shoppingItemId = null
  }

  const owners: Record<Attachment['ownerType'], (id: string) => { tripId: string } | undefined> = {
    trip: (id) => (trips.has(id) ? { tripId: id } : undefined),
    place: (id) => places.get(id),
    activity: (id) => activities.get(id),
    shopping: (id) => items.get(id),
    booking: (id) => bookings.get(id),
  }
  t.attachments = t.attachments.filter((att) => {
    const owner = owners[att.ownerType](att.ownerId)
    if (owner && owner.tripId === att.tripId) return true
    warnings.push(`attachments ${att.id}: owner missing, skipped`)
    return false
  })
  const attachmentIds = new Set(t.attachments.map((a) => a.id))
  for (const s of t.shopping_items) {
    requireTrip('shopping_items', s)
    if (!sameTrip(places, s.shopPlaceId, s.tripId)) s.shopPlaceId = null
    if (s.imageId && !attachmentIds.has(s.imageId)) {
      warnings.push(`shopping_items ${s.id}: missing image unlinked`)
      s.imageId = null
    }
  }
  for (const trip of t.trips) {
    if (trip.coverImageId && !attachmentIds.has(trip.coverImageId)) {
      warnings.push(`trips ${trip.id}: missing cover unlinked`)
      trip.coverImageId = null
    }
  }

  t.trip_settings = t.trip_settings.filter((s) => trips.has(s.tripId))
  const withSettings = new Set(t.trip_settings.map((s) => s.tripId))
  const ts = nowIso()
  for (const trip of t.trips) {
    if (!withSettings.has(trip.id)) {
      warnings.push(`trips ${trip.id}: missing settings recreated`)
      t.trip_settings.push(defaultTripSettings(trip.id))
    }
    // Every date in the trip range needs a day row.
    enumerateDates(trip.startDate, trip.endDate).forEach((date, i) => {
      if (dayDates.has(`${trip.id}|${date}`)) return
      warnings.push(`trips ${trip.id}: missing day ${date} recreated`)
      dayDates.add(`${trip.id}|${date}`)
      t.trip_days.push({ id: newId(), tripId: trip.id, date, dayOrder: i + 1, createdAt: ts, updatedAt: ts })
    })
  }
}

/** Reads and fully validates a backup file. Nothing is written to the database. */
export async function readBackup(file: Blob): Promise<ParsedBackup> {
  const JSZipCtor = await loadJSZip()
  let zip: JSZip
  try {
    zip = await JSZipCtor.loadAsync(await file.arrayBuffer())
  } catch {
    throw new BackupError('backup.notZip')
  }
  const manifestEntry =
    zip.file(`${ROOT}/manifest.json`) ?? zip.file(/(^|\/)manifest\.json$/).find((f) => !f.dir) ?? null
  if (!manifestEntry) throw new BackupError('backup.missingManifest')
  const prefix = manifestEntry.name.slice(0, -'manifest.json'.length)

  const manifestResult = manifestSchema.safeParse(parseJson(await manifestEntry.async('string'), 'backup.invalidManifest'))
  if (!manifestResult.success) throw new BackupError('backup.invalidManifest')
  const manifest = manifestResult.data as unknown as BackupManifest
  if (manifest.backupFormatVersion > BACKUP_FORMAT_VERSION) throw new BackupError('backup.newerFormat')
  if (manifest.schemaVersion > SCHEMA_VERSION) throw new BackupError('backup.newerSchema')

  const dbEntry = zip.file(`${prefix}database.json`)
  if (!dbEntry) throw new BackupError('backup.missingDatabase')
  const dbResult = databaseJsonSchema.safeParse(parseJson(await dbEntry.async('string'), 'backup.invalidDatabase'))
  if (!dbResult.success) throw new BackupError('backup.invalidDatabase')

  const raw: RawTables = migrateBackupTables(
    { ...(dbResult.data.tables as RawTables), attachments: manifest.attachments },
    manifest.schemaVersion,
  )
  const errors: string[] = []
  const warnings: string[] = []
  const tables = {} as BackupTables
  for (const name of TABLE_NAMES) {
    if (name === 'attachments') continue
    ;(tables as unknown as Record<string, unknown[]>)[name] = validateRecords(name, raw[name] ?? [], TABLE_SCHEMAS[name], errors)
  }

  tables.attachments = []
  let attachmentBytes = 0
  for (const [i, metaRaw] of (raw.attachments ?? []).entries()) {
    const meta = attachmentMetaSchema.safeParse(metaRaw)
    const path = (metaRaw as { path?: unknown }).path
    if (!meta.success) {
      errors.push(`attachments[${i}]: ${meta.error.issues[0].message}`)
      continue
    }
    if (path !== `attachments/${meta.data.id}`) {
      errors.push(`attachments[${i}]: invalid path`)
      continue
    }
    const entry = zip.file(`${prefix}${path}`)
    if (!entry) {
      errors.push(`attachments ${meta.data.id}: file missing`)
      continue
    }
    const data = await entry.async('arraybuffer')
    if (data.byteLength !== meta.data.size) {
      errors.push(`attachments ${meta.data.id}: size mismatch`)
      continue
    }
    attachmentBytes += data.byteLength
    tables.attachments.push({ ...meta.data, blob: new Blob([data], { type: meta.data.mimeType }) })
  }

  if (errors.length === 0) checkRelations(tables, errors, warnings)
  if (errors.length > 0) throw new BackupError('backup.invalidData', errors.slice(0, 20))
  return { manifest, tables, warnings, attachmentBytes }
}

export type MergeConflictPolicy = 'skip' | 'replace' | 'copy'
export type RestoreOptions =
  | { mode: 'replace' }
  | { mode: 'merge'; onConflict: MergeConflictPolicy; copySuffix?: string }

export interface RestoreResult {
  imported: number
  replaced: number
  copied: number
  skipped: number
  attachments: number
}

interface TripBundle {
  trip: Trip
  days: TripDay[]
  places: Place[]
  activities: Activity[]
  items: ShoppingItem[]
  bookings: Booking[]
  attachments: Attachment[]
  expenses: Expense[]
  settings: TripSettings[]
}

function bundleFor(t: BackupTables, trip: Trip): TripBundle {
  const of = <R extends { tripId: string }>(rows: R[]) => rows.filter((r) => r.tripId === trip.id)
  return {
    trip,
    days: of(t.trip_days),
    places: of(t.places),
    activities: of(t.activities),
    items: of(t.shopping_items),
    bookings: of(t.bookings),
    attachments: of(t.attachments),
    expenses: of(t.expenses),
    settings: of(t.trip_settings),
  }
}

/** Gives every record in a bundle a new id and rewrites all references. */
function remapBundle(b: TripBundle, nameSuffix: string): TripBundle {
  const ids = new Map<string, string>()
  const fresh = (old: string) => {
    const n = newId()
    ids.set(old, n)
    return n
  }
  const map = (old: string | null | undefined) => (old ? (ids.get(old) ?? null) : null)
  const tripId = fresh(b.trip.id)
  const days = b.days.map((d) => ({ ...d, id: fresh(d.id), tripId }))
  const places = b.places.map((p) => ({ ...p, id: fresh(p.id), tripId }))
  const activities = b.activities.map((a) => ({ ...a, id: fresh(a.id), tripId, tripDayId: map(a.tripDayId)!, placeId: map(a.placeId) }))
  const items = b.items.map((s) => ({ ...s, id: fresh(s.id), tripId, shopPlaceId: map(s.shopPlaceId) }))
  const bookings = b.bookings.map((x) => ({ ...x, id: fresh(x.id), tripId, placeId: map(x.placeId) }))
  const attachments = b.attachments.map((a) => ({ ...a, id: fresh(a.id), tripId, ownerId: map(a.ownerId)! }))
  for (const s of items) s.imageId = map(s.imageId)
  const expenses = b.expenses.map((e) => ({
    ...e,
    id: fresh(e.id),
    tripId,
    activityId: map(e.activityId),
    shoppingItemId: map(e.shoppingItemId),
  }))
  return {
    trip: { ...b.trip, id: tripId, name: `${b.trip.name}${nameSuffix}`.slice(0, 120), coverImageId: map(b.trip.coverImageId) },
    days,
    places,
    activities,
    items,
    bookings,
    attachments,
    expenses,
    settings: b.settings.map((s) => ({ ...s, tripId })),
  }
}

async function addBundle(b: TripBundle): Promise<void> {
  await db.trips.add(b.trip)
  await db.trip_days.bulkAdd(b.days)
  await db.places.bulkAdd(b.places)
  await db.activities.bulkAdd(b.activities)
  await db.shopping_items.bulkAdd(b.items)
  await db.bookings.bulkAdd(b.bookings)
  await db.attachments.bulkAdd(b.attachments)
  await db.expenses.bulkAdd(b.expenses)
  await db.trip_settings.bulkPut(b.settings)
}

/** True when any record id of the bundle already exists locally. */
async function bundleCollides(b: TripBundle): Promise<boolean> {
  const checks: Array<Promise<unknown[]>> = [
    db.trip_days.bulkGet(b.days.map((x) => x.id)),
    db.places.bulkGet(b.places.map((x) => x.id)),
    db.activities.bulkGet(b.activities.map((x) => x.id)),
    db.shopping_items.bulkGet(b.items.map((x) => x.id)),
    db.bookings.bulkGet(b.bookings.map((x) => x.id)),
    db.attachments.bulkGet(b.attachments.map((x) => x.id)),
    db.expenses.bulkGet(b.expenses.map((x) => x.id)),
  ]
  return (await Promise.all(checks)).some((rows) => rows.some(Boolean))
}

async function ensureSystemCategories(): Promise<void> {
  const existing = await db.categories.bulkGet(SYSTEM_CATEGORIES.map((c) => c.id))
  const missing = SYSTEM_CATEGORIES.filter((_, i) => !existing[i])
  if (missing.length) await db.categories.bulkAdd(missing)
}

async function ensureActiveTrip(): Promise<void> {
  const active = await getSetting('activeTripId')
  if (active && (await db.trips.get(active))) return
  const first = await db.trips.orderBy('startDate').last()
  await setSetting('activeTripId', first?.id ?? null)
}

/**
 * Writes a validated backup. Everything happens in one transaction: if anything fails the
 * database is left exactly as it was, and success is only reported after commit.
 */
export async function restoreBackup(parsed: ParsedBackup, options: RestoreOptions): Promise<RestoreResult> {
  const t = parsed.tables
  const result: RestoreResult = { imported: 0, replaced: 0, copied: 0, skipped: 0, attachments: 0 }

  await db.transaction('rw', db.allTables, async () => {
    if (options.mode === 'replace') {
      for (const table of db.allTables) await table.clear()
      await db.categories.bulkAdd(t.categories)
      await db.app_settings.bulkAdd(t.app_settings)
      for (const trip of t.trips) {
        const bundle = bundleFor(t, trip)
        await addBundle(bundle)
        result.imported++
        result.attachments += bundle.attachments.length
      }
    } else {
      const existingCategories = new Set(await db.categories.toCollection().primaryKeys())
      const newCategories = t.categories.filter((c) => !existingCategories.has(c.id) && !isSystemCategoryId(c.id))
      if (newCategories.length) await db.categories.bulkAdd(newCategories)

      for (const trip of t.trips) {
        let bundle = bundleFor(t, trip)
        const exists = !!(await db.trips.get(trip.id))
        if (exists && options.onConflict === 'skip') {
          result.skipped++
          continue
        }
        if (exists && options.onConflict === 'replace') {
          await deleteTrip(trip.id)
          result.replaced++
        } else if (exists || (await bundleCollides(bundle))) {
          bundle = remapBundle(bundle, options.copySuffix ?? '')
          result.copied++
        } else {
          result.imported++
        }
        await addBundle(bundle)
        result.attachments += bundle.attachments.length
      }
    }
    await ensureSystemCategories()
    await ensureActiveTrip()
  })
  return result
}

/** Rough size of a backup right now: attachment bytes plus a little JSON overhead. */
export async function estimateBackupBytes(): Promise<number> {
  let bytes = 0
  await db.attachments.each((a) => {
    bytes += a.size
  })
  const records = await Promise.all(
    TABLE_NAMES.filter((n) => n !== 'attachments').map((n) => db.table(n).count()),
  )
  return bytes + records.reduce((s, n) => s + n, 0) * 600
}
