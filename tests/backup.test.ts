// @vitest-environment node
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { SCHEMA_VERSION } from '@/db/migrations'
import { getSetting, setSetting } from '@/db/repositories/settingsRepository'
import { createSampleTrip } from '@/dev/sampleData'
import { createBackup, readBackup, restoreBackup } from '@/services/backupService'
import { createShoppingItem } from '@/services/shoppingService'
import { getTripStats } from '@/services/tripService'
import { BackupError } from '@/utils/errors'
import { pngBlob } from './helpers'

async function seed() {
  const trip = await createSampleTrip('2026-11-10')
  const item = await createShoppingItem(
    trip.id,
    { name: 'With photo', quantity: 1, purchasedQuantity: 0, currency: 'JPY', priority: 'high', cancelled: false },
    { kind: 'replace', file: { blob: pngBlob(128), filename: 'photo.png', mimeType: 'image/png', size: 128 } },
  )
  await setSetting('theme', 'dark')
  return { trip, item }
}

async function snapshot() {
  const out: Record<string, unknown[]> = {}
  for (const table of db.allTables) {
    const rows = await table.toArray()
    out[table.name] = rows
      .map((r) => {
        const { blob, ...rest } = r as unknown as Record<string, unknown>
        return blob instanceof Blob ? { ...rest, blobSize: blob.size } : rest
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  return out
}

async function rezip(file: Blob, mutate: (zip: JSZip) => Promise<void> | void): Promise<Blob> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  await mutate(zip)
  return zip.generateAsync({ type: 'blob' })
}

describe('backup export', () => {
  it('writes manifest, database and attachments into TRAVO_Backup/', async () => {
    await seed()
    const { file, manifest } = await createBackup()
    expect(file.name).toMatch(/^TRAVO_Backup_.*\.zip$/)
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    expect(zip.file('TRAVO_Backup/manifest.json')).toBeTruthy()
    expect(zip.file('TRAVO_Backup/database.json')).toBeTruthy()
    expect(manifest).toMatchObject({ format: 'travo-backup', backupFormatVersion: 1, schemaVersion: SCHEMA_VERSION, appVersion: 'test' })
    expect(manifest.attachments).toHaveLength(1)
    const bytes = await zip.file(`TRAVO_Backup/${manifest.attachments[0].path}`)!.async('uint8array')
    expect(bytes.byteLength).toBe(128)
    expect((await getSetting('backupMeta'))?.lastBackupBytes).toBe(file.size)
  })
})

describe('restore', () => {
  it('replace-all restores every record, id and attachment exactly', async () => {
    await seed()
    const before = await snapshot()
    const { file } = await createBackup()

    await db.delete()
    await db.open()
    const parsed = await readBackup(file)
    const result = await restoreBackup(parsed, { mode: 'replace' })
    expect(result.imported).toBe(1)
    expect(result.attachments).toBe(1)

    const after = await snapshot()
    // backupMeta is written by createBackup after the export snapshot was taken.
    const strip = (s: Record<string, unknown[]>) => ({ ...s, app_settings: s.app_settings.filter((r) => (r as { key: string }).key !== 'backupMeta') })
    expect(strip(after)).toEqual(strip(before))
    expect(await getSetting('theme')).toBe('dark')
  })

  it('merge skips, replaces or copies trips that already exist', async () => {
    const { trip } = await seed()
    const { file } = await createBackup()
    const parsed = await readBackup(file)

    const skipped = await restoreBackup(parsed, { mode: 'merge', onConflict: 'skip' })
    expect(skipped).toMatchObject({ skipped: 1, imported: 0 })
    expect(await db.trips.count()).toBe(1)

    const copied = await restoreBackup(parsed, { mode: 'merge', onConflict: 'copy', copySuffix: ' (imported)' })
    expect(copied.copied).toBe(1)
    const trips = await db.trips.toArray()
    expect(trips).toHaveLength(2)
    const copy = trips.find((t) => t.id !== trip.id)!
    expect(copy.name).toContain('(imported)')
    expect(await getTripStats(copy.id)).toEqual(await getTripStats(trip.id))

    await db.trips.update(trip.id, { name: 'Changed locally' })
    const replaced = await restoreBackup(parsed, { mode: 'merge', onConflict: 'replace' })
    expect(replaced.replaced).toBe(1)
    expect((await db.trips.get(trip.id))?.name).not.toBe('Changed locally')
    expect(await db.trips.count()).toBe(2)
  })

  it('rejects files that are not TRAVO backups', async () => {
    await expect(readBackup(new Blob(['hello']))).rejects.toMatchObject({ message: 'backup.notZip' })
    const zip = new JSZip()
    zip.file('something.txt', 'x')
    await expect(readBackup(await zip.generateAsync({ type: 'blob' }))).rejects.toMatchObject({ message: 'backup.missingManifest' })
  })

  it('rejects backups from a newer schema', async () => {
    await seed()
    const { file } = await createBackup()
    const tampered = await rezip(file, async (zip) => {
      const manifest = JSON.parse(await zip.file('TRAVO_Backup/manifest.json')!.async('string'))
      zip.file('TRAVO_Backup/manifest.json', JSON.stringify({ ...manifest, schemaVersion: SCHEMA_VERSION + 1 }))
    })
    await expect(readBackup(tampered)).rejects.toMatchObject({ message: 'backup.newerSchema' })
  })

  it('validates records, references and attachment sizes, and leaves existing data untouched', async () => {
    await seed()
    const { file } = await createBackup()
    const before = await snapshot()

    const badRecord = await rezip(file, async (zip) => {
      const data = JSON.parse(await zip.file('TRAVO_Backup/database.json')!.async('string'))
      data.tables.activities[0].tripDayId = 'missing-day'
      data.tables.shopping_items[0].quantity = -2
      zip.file('TRAVO_Backup/database.json', JSON.stringify(data))
    })
    const error = await readBackup(badRecord).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BackupError)
    expect((error as BackupError).details.length).toBeGreaterThan(0)

    const truncated = await rezip(file, async (zip) => {
      const manifest = JSON.parse(await zip.file('TRAVO_Backup/manifest.json')!.async('string'))
      zip.file(`TRAVO_Backup/${manifest.attachments[0].path}`, new Uint8Array(3))
    })
    await expect(readBackup(truncated)).rejects.toMatchObject({ message: 'backup.invalidData' })

    expect(await snapshot()).toEqual(before)
  })

  it('rolls back the whole restore when writing fails', async () => {
    await seed()
    const { file } = await createBackup()
    const parsed = await readBackup(file)
    const before = await snapshot()
    // Force a constraint error halfway through: two activities with the same id.
    parsed.tables.activities.push({ ...parsed.tables.activities[0] })
    await expect(restoreBackup(parsed, { mode: 'replace' })).rejects.toBeTruthy()
    expect(await snapshot()).toEqual(before)
  })
})
