import { db } from '@/db/database'
import { expenseSchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Expense, TripSettings } from '@/types/entities'
import { IntegrityError, NotFoundError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { roundMoney, roundRate } from '@/utils/money'
import { computeAmountTHB, effectiveExpenseRate } from '@/utils/spending'

export interface ExpenseInput {
  description: string
  amount: number
  currency: string
  /** Optional user-provided rate for this expense; null follows the trip rate. */
  exchangeRateToTHB?: number | null
  expenseDate: string
  category: string
  activityId?: string | null
  shoppingItemId?: string | null
  notes?: string
}

async function assertLinks(tripId: string, input: ExpenseInput): Promise<void> {
  if (input.activityId) {
    const activity = await db.activities.get(input.activityId)
    if (!activity || activity.tripId !== tripId) throw new IntegrityError('error.invalidActivity')
  }
  if (input.shoppingItemId) {
    const item = await db.shopping_items.get(input.shoppingItemId)
    if (!item || item.tripId !== tripId) throw new IntegrityError('error.invalidShoppingItem')
  }
}

function buildExpense(base: Pick<Expense, 'id' | 'tripId' | 'createdAt'>, input: ExpenseInput, settings: TripSettings | undefined): Expense {
  const amount = Number.isFinite(input.amount) ? roundMoney(input.amount, input.currency) : input.amount
  const explicitRate =
    input.exchangeRateToTHB === null || input.exchangeRateToTHB === undefined || input.currency === 'THB'
      ? null
      : roundRate(input.exchangeRateToTHB)
  const draft = validate(expenseSchema, {
    notes: undefined,
    ...base,
    ...input,
    amount,
    exchangeRateToTHB: explicitRate,
    amountTHB: null,
    activityId: input.activityId ?? null,
    shoppingItemId: input.shoppingItemId ?? null,
    updatedAt: nowIso(),
  })
  return { ...draft, amountTHB: computeAmountTHB(draft.amount, draft.currency, effectiveExpenseRate(draft, settings)) }
}

const WRITE_TABLES = () => [db.trips, db.expenses, db.activities, db.shopping_items, db.trip_settings]

export async function createExpense(tripId: string, input: ExpenseInput): Promise<Expense> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    if (!(await db.trips.get(tripId))) throw new NotFoundError('trip')
    await assertLinks(tripId, input)
    const expense = buildExpense({ id: newId(), tripId, createdAt: nowIso() }, input, await db.trip_settings.get(tripId))
    await db.expenses.add(expense)
    return expense
  })
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    const existing = await db.expenses.get(id)
    if (!existing) throw new NotFoundError('expense')
    await assertLinks(existing.tripId, input)
    const expense = buildExpense(existing, input, await db.trip_settings.get(existing.tripId))
    await db.expenses.put(expense)
    return expense
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id)
}

/**
 * Recomputes stored THB amounts after the trip's rates change. Expenses with their own
 * explicit rate keep it. Call inside a transaction that includes db.expenses.
 */
export async function recalculateExpenses(tripId: string, settings: TripSettings): Promise<void> {
  await db.expenses
    .where('tripId')
    .equals(tripId)
    .modify((e) => {
      e.amountTHB = computeAmountTHB(e.amount, e.currency, effectiveExpenseRate(e, settings))
    })
}
