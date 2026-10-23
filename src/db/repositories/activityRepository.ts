import Dexie from 'dexie'
import { db } from '../database'
import type { Activity } from '@/types/entities'

export async function listActivitiesByTrip(tripId: string): Promise<Activity[]> {
  return db.activities.where('tripId').equals(tripId).toArray()
}

/** Activities of one day in manual sort order. */
export async function listActivitiesByDay(tripDayId: string): Promise<Activity[]> {
  return db.activities
    .where('[tripDayId+sortOrder]')
    .between([tripDayId, Dexie.minKey], [tripDayId, Dexie.maxKey])
    .toArray()
}
