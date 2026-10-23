import { db } from '@/db/database'
import { categorySchema } from '@/db/schema'
import { isSystemCategoryId } from '@/db/seed'
import { validate } from '@/db/validate'
import type { Category } from '@/types/entities'
import { AppError, NotFoundError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'

export interface CategoryInput {
  name: string
  icon: string
  color: string
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return db.transaction('rw', [db.categories], async () => {
    const all = await db.categories.toArray()
    const category = validate(categorySchema, {
      ...input,
      id: newId(),
      sortOrder: all.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1,
      isSystem: false,
    })
    await db.categories.add(category)
    return category
  })
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  return db.transaction('rw', [db.categories], async () => {
    const existing = await db.categories.get(id)
    if (!existing) throw new NotFoundError('category')
    if (existing.isSystem) throw new AppError('system_category', 'error.systemCategory')
    const category = validate(categorySchema, { ...existing, ...input })
    await db.categories.put(category)
    return category
  })
}

export async function countCategoryUsage(id: string): Promise<number> {
  return db.places.where('categoryId').equals(id).count()
}

/**
 * Deletes a custom category. Places using it are reassigned (default "other") in the same
 * transaction, so no place is left with a missing category.
 */
export async function deleteCategory(id: string, reassignTo = 'other'): Promise<number> {
  if (isSystemCategoryId(id)) throw new AppError('system_category', 'error.systemCategory')
  return db.transaction('rw', [db.categories, db.places], async () => {
    const target = await db.categories.get(reassignTo)
    if (!target || target.id === id) throw new NotFoundError('category')
    const category = isSystemCategoryId(target.id) ? target.id : 'other'
    const moved = await db.places
      .where('categoryId')
      .equals(id)
      .modify({ categoryId: target.id, category, updatedAt: nowIso() })
    await db.categories.delete(id)
    return moved
  })
}
