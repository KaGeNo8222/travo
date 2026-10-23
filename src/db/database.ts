import Dexie, { type EntityTable } from 'dexie'
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
import { DB_NAME, defineSchema } from './migrations'
import { SYSTEM_CATEGORIES } from './seed'

export class TravoDatabase extends Dexie {
  declare trips: EntityTable<Trip, 'id'>
  declare trip_days: EntityTable<TripDay, 'id'>
  declare places: EntityTable<Place, 'id'>
  declare activities: EntityTable<Activity, 'id'>
  declare shopping_items: EntityTable<ShoppingItem, 'id'>
  declare bookings: EntityTable<Booking, 'id'>
  declare attachments: EntityTable<Attachment, 'id'>
  declare expenses: EntityTable<Expense, 'id'>
  declare categories: EntityTable<Category, 'id'>
  declare trip_settings: EntityTable<TripSettings, 'tripId'>
  declare app_settings: EntityTable<AppSettings, 'key'>

  constructor(name: string = DB_NAME) {
    super(name)
    defineSchema(this)
    // Runs once when the database is first created. Only system categories are seeded —
    // never demo trips.
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(SYSTEM_CATEGORIES)
    })
  }

  /** Every table, for transactions that span the whole database. */
  get allTables() {
    return [
      this.trips,
      this.trip_days,
      this.places,
      this.activities,
      this.shopping_items,
      this.bookings,
      this.attachments,
      this.expenses,
      this.categories,
      this.trip_settings,
      this.app_settings,
    ]
  }

  /** Tables holding records that belong to a trip. */
  get tripTables() {
    return [
      this.trips,
      this.trip_days,
      this.places,
      this.activities,
      this.shopping_items,
      this.bookings,
      this.attachments,
      this.expenses,
      this.trip_settings,
      this.app_settings,
    ]
  }
}

export const db = new TravoDatabase()
