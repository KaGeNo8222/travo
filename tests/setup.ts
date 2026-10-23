import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { db } from '@/db/database'

// Every test starts from an empty database (system categories are re-seeded on open).
beforeEach(async () => {
  await db.delete()
  await db.open()
})
