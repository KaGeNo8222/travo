import type { Expense, ShoppingItem, TripSettings } from '@/types/entities'
import {
  convertFromTHB,
  convertToTHB,
  fromMinor,
  multiplyMoney,
  toMinor,
} from './money'
import { instantToLocalDate } from './time'

// Single financial source of truth:
// - Manual spending lives in `expenses`.
// - Shopping spending is computed from `shopping_items` (purchased quantity × price).
// - If an expense is linked to a shopping item, that expense replaces the item's computed
//   amount, so nothing is ever counted twice. Marking an item purchased never creates
//   an expense automatically.

export type RateSettings = Pick<
  TripSettings,
  'baseCurrency' | 'exchangeRateToTHB' | 'otherRatesToTHB'
> | null | undefined

/** User-provided THB rate for a currency, or null when unknown. */
export function rateToTHB(currency: string, settings: RateSettings): number | null {
  if (currency === 'THB') return 1
  if (!settings) return null
  if (currency === settings.baseCurrency) return settings.exchangeRateToTHB ?? null
  return settings.otherRatesToTHB?.[currency] ?? null
}

export function effectiveExpenseRate(
  expense: Pick<Expense, 'currency' | 'exchangeRateToTHB'>,
  settings: RateSettings,
): number | null {
  return expense.exchangeRateToTHB ?? rateToTHB(expense.currency, settings)
}

export function computeAmountTHB(amount: number, currency: string, rate: number | null): number | null {
  return rate === null ? null : convertToTHB(amount, currency, rate)
}

/** Converts between any two currencies through THB; null when a rate is missing. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  settings: RateSettings,
): number | null {
  if (from === to) return amount
  const rFrom = rateToTHB(from, settings)
  if (rFrom === null) return null
  const thb = convertToTHB(amount, from, rFrom)
  if (to === 'THB') return thb
  const rTo = rateToTHB(to, settings)
  return rTo === null ? null : convertFromTHB(thb, to, rTo)
}

export interface SpendingLine {
  key: string
  source: 'expense' | 'shopping'
  refId: string
  description: string
  amount: number
  currency: string
  amountTHB: number | null
  /** Local date in the trip time zone. */
  date: string
  category: string
  /** Shopping line priced from the estimate because no actual price was entered. */
  estimated: boolean
}

export function shoppingSpend(
  item: Pick<ShoppingItem, 'actualUnitPrice' | 'estimatedUnitPrice' | 'purchasedQuantity' | 'currency'>,
): { amount: number; estimated: boolean } | null {
  if (item.purchasedQuantity <= 0) return null
  const unit = item.actualUnitPrice ?? item.estimatedUnitPrice
  if (unit === null || unit === undefined) return null
  return {
    amount: multiplyMoney(unit, item.purchasedQuantity, item.currency),
    estimated: item.actualUnitPrice === null || item.actualUnitPrice === undefined,
  }
}

export function buildSpendingLines(
  expenses: readonly Expense[],
  items: readonly ShoppingItem[],
  settings: RateSettings,
  tz: string,
): SpendingLine[] {
  const lines: SpendingLine[] = expenses.map((e) => ({
    key: `e:${e.id}`,
    source: 'expense',
    refId: e.id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    amountTHB: e.amountTHB ?? computeAmountTHB(e.amount, e.currency, effectiveExpenseRate(e, settings)),
    date: e.expenseDate,
    category: e.category,
    estimated: false,
  }))
  const linkedItems = new Set(expenses.map((e) => e.shoppingItemId).filter(Boolean))
  for (const item of items) {
    if (item.status === 'cancelled' || linkedItems.has(item.id)) continue
    const spend = shoppingSpend(item)
    if (!spend) continue
    lines.push({
      key: `s:${item.id}`,
      source: 'shopping',
      refId: item.id,
      description: item.name,
      amount: spend.amount,
      currency: item.currency,
      amountTHB: computeAmountTHB(spend.amount, item.currency, rateToTHB(item.currency, settings)),
      date: instantToLocalDate(item.purchasedAt ?? item.updatedAt, tz),
      category: 'shopping',
      estimated: spend.estimated,
    })
  }
  return lines
}

/** A line's value in `target` currency, or null when it cannot be converted. */
export function lineIn(line: SpendingLine, target: string, settings: RateSettings): number | null {
  if (line.currency === target) return line.amount
  if (line.amountTHB === null) return null
  if (target === 'THB') return line.amountTHB
  const rate = rateToTHB(target, settings)
  return rate === null ? null : convertFromTHB(line.amountTHB, target, rate)
}

export interface SpendingSummary {
  currency: string
  total: number
  expenseTotal: number
  shoppingTotal: number
  unconverted: SpendingLine[]
  byCategory: Array<{ category: string; total: number }>
  byDay: Array<{ date: string; total: number }>
}

export function summarizeSpending(
  lines: readonly SpendingLine[],
  currency: string,
  settings: RateSettings,
): SpendingSummary {
  let total = 0
  let expenseTotal = 0
  let shoppingTotal = 0
  const unconverted: SpendingLine[] = []
  const byCategory = new Map<string, number>()
  const byDay = new Map<string, number>()
  for (const line of lines) {
    const value = lineIn(line, currency, settings)
    if (value === null) {
      unconverted.push(line)
      continue
    }
    const minor = toMinor(value, currency)
    total += minor
    if (line.source === 'expense') expenseTotal += minor
    else shoppingTotal += minor
    byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + minor)
    byDay.set(line.date, (byDay.get(line.date) ?? 0) + minor)
  }
  return {
    currency,
    total: fromMinor(total, currency),
    expenseTotal: fromMinor(expenseTotal, currency),
    shoppingTotal: fromMinor(shoppingTotal, currency),
    unconverted,
    byCategory: [...byCategory]
      .map(([category, v]) => ({ category, total: fromMinor(v, currency) }))
      .sort((a, b) => b.total - a.total),
    byDay: [...byDay]
      .map(([date, v]) => ({ date, total: fromMinor(v, currency) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}
