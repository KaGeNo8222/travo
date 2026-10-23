// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TravoDatabase, db } from '@/db/database'
import { SCHEMA_VERSION, STORES_V1, TABLE_NAMES, migrateBackupTables } from '@/db/migrations'
import { DEFAULT_SETTINGS, getAllSettings, getSetting, setSetting } from '@/db/repositories/settingsRepository'
import { SYSTEM_CATEGORIES } from '@/db/seed'
import { checkIntegrity, isReportClean } from '@/services/integrityService'
import { setPurchasedQuantity, createShoppingItem } from '@/services/shoppingService'
import { makeTrip } from './helpers'

describe('database schema', () => {
  it('opens travo_db at the current version with all 11 tables', () => {
    expect(db.name).toBe('travo_db')
    expect(db.verno).toBe(SCHEMA_VERSION)
    expect(TABLE_NAMES).toHaveLength(11)
    expect(db.tables.map((t) => t.name).sort()).toEqual([...TABLE_NAMES].sort())
    expect(STORES_V1.trip_days).toContain('&[tripId+date]')
  })

  it('seeds system categories on first open only', async () => {
    expect((await db.categories.orderBy('sortOrder').toArray()).map((c) => c.id)).toEqual(SYSTEM_CATEGORIES.map((c) => c.id))
  })

  it('keeps data across a close/reopen (app restart)', async () => {
    const { trip } = await makeTrip()
    const item = await createShoppingItem(trip.id, { name: 'Gift', quantity: 2, purchasedQuantity: 0, currency: 'JPY', priority: 'low', cancelled: false })
    await setPurchasedQuantity(item.id, 2)
    db.close()
    const reopened = new TravoDatabase()
    await reopened.open()
    expect((await reopened.trips.get(trip.id))?.name).toBe(trip.name)
    expect((await reopened.shopping_items.get(item.id))?.status).toBe('purchased')
    expect(await reopened.categories.count()).toBe(SYSTEM_CATEGORIES.length) // not re-seeded
    reopened.close()
    await db.open()
  })

  it('enforces one day per date within a trip', async () => {
    const { trip, days } = await makeTrip()
    await expect(db.trip_days.add({ ...days[0], id: 'dup', tripId: trip.id })).rejects.toMatchObject({ name: 'ConstraintError' })
  })

  it('upgrades backup data from older schema versions (no-op at v1)', () => {
    const tables = { trips: [{ id: 'x' }] }
    expect(migrateBackupTables(tables, SCHEMA_VERSION)).toEqual(tables)
  })
})

describe('app settings', () => {
  it('returns defaults and validates values', async () => {
    expect(await getAllSettings()).toEqual(DEFAULT_SETTINGS)
    await setSetting('language', 'en')
    expect(await getSetting('language')).toBe('en')
    // @ts-expect-error invalid value is rejected at runtime too
    await expect(setSetting('theme', 'purple')).rejects.toBeTruthy()
    await db.app_settings.put({ key: 'theme', value: 'purple', updatedAt: new Date().toISOString() })
    expect(await getSetting('theme')).toBe('system') // malformed stored value falls back
  })
})

describe('integrity check', () => {
  it('finds and repairs orphans and dangling links', async () => {
    const { trip, days } = await makeTrip()
    const ts = new Date().toISOString()
    await db.activities.add({ id: 'a1', tripId: trip.id, tripDayId: days[0].id, placeId: 'gone', title: 'x', sortOrder: 0, status: 'planned', createdAt: ts, updatedAt: ts })
    await db.places.add({ id: 'p-orphan', tripId: 'no-trip', name: 'x', category: 'other', isVisited: false, createdAt: ts, updatedAt: ts })
    await db.attachments.add({ id: 'f1', tripId: trip.id, ownerType: 'shopping', ownerId: 'gone', filename: 'a.png', mimeType: 'image/png', size: 1, blob: new Blob(['a']), createdAt: ts })
    await db.trip_days.delete(days[4].id)

    const report = await checkIntegrity()
    expect(report).toMatchObject({ orphanRecords: 1, orphanAttachments: 1, danglingLinks: 1, missingDays: 1 })
    await checkIntegrity(true)
    expect(isReportClean(await checkIntegrity())).toBe(true)
    expect((await db.activities.get('a1'))?.placeId).toBeNull()
  })
})
