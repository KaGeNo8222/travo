import type Dexie from 'dexie'

export const DB_NAME = 'travo_db'

/** Current Dexie schema version. Bump it together with a new entry in defineSchema(). */
export const SCHEMA_VERSION = 1

// Notes on indexes:
// - Booleans are not valid IndexedDB keys, so `isVisited` is filtered in memory instead of
//   being indexed (an index on it would silently stay empty).
// - `&[tripId+date]` makes trip days unique per date within a trip.
export const STORES_V1 = {
  trips: 'id, startDate, status, updatedAt',
  trip_days: 'id, tripId, &[tripId+date]',
  places: 'id, tripId, category, categoryId, [tripId+category]',
  activities: 'id, tripId, tripDayId, placeId, [tripDayId+sortOrder]',
  shopping_items: 'id, tripId, status, shopPlaceId, [tripId+status]',
  bookings: 'id, tripId, type, placeId, [tripId+type]',
  attachments: 'id, tripId, [ownerType+ownerId]',
  expenses: 'id, tripId, expenseDate, activityId, shoppingItemId, [tripId+expenseDate]',
  categories: 'id, sortOrder',
  trip_settings: 'tripId',
  app_settings: 'key',
} as const

export const TABLE_NAMES = Object.keys(STORES_V1) as Array<keyof typeof STORES_V1>
export type TableName = (typeof TABLE_NAMES)[number]

/**
 * Declares every schema version. Keep old versions when adding new ones so existing
 * installs upgrade in place, e.g.:
 *
 *   db.version(2)
 *     .stores({ ...STORES_V1, places: 'id, tripId, category, categoryId, [tripId+category], name' })
 *     .upgrade(async (tx) => {
 *       await tx.table('places').toCollection().modify((p) => { p.name = p.name.trim() })
 *     })
 */
export function defineSchema(db: Dexie): void {
  db.version(1).stores(STORES_V1)
}

export type RawTables = Partial<Record<TableName, unknown[]>>

/**
 * Upgrades backup data exported by an older schema version. Each step takes data at
 * version N and returns data at version N + 1. Mirror Dexie upgrade() logic here.
 */
const BACKUP_UPGRADES: Record<number, (tables: RawTables) => RawTables> = {}

export function migrateBackupTables(tables: RawTables, fromVersion: number): RawTables {
  let data = tables
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = BACKUP_UPGRADES[v]
    if (step) data = step(data)
  }
  return data
}
