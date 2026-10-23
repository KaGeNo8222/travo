import { db } from '../database'
import type { Category } from '@/types/entities'

export async function listCategories(): Promise<Category[]> {
  return db.categories.orderBy('sortOrder').toArray()
}
