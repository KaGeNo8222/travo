import { db } from '../database'
import type { Expense } from '@/types/entities'

/** Newest first. */
export async function listExpenses(tripId: string): Promise<Expense[]> {
  const expenses = await db.expenses.where('tripId').equals(tripId).toArray()
  return expenses.sort(
    (a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt),
  )
}
