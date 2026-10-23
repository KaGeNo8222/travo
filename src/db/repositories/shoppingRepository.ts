import { db } from '../database'
import type { ShoppingItem } from '@/types/entities'

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const

/** Items to buy first (high priority first), then purchased, then cancelled. */
export async function listShoppingItems(tripId: string): Promise<ShoppingItem[]> {
  const items = await db.shopping_items.where('tripId').equals(tripId).toArray()
  const statusRank = { to_buy: 0, purchased: 1, cancelled: 2 } as const
  return items.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.createdAt.localeCompare(b.createdAt),
  )
}
