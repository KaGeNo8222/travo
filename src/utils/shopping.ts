import type { ShoppingItem, ShoppingStatus } from '@/types/entities'
import { multiplyMoney, toMinor, fromMinor } from './money'
import { convertAmount, shoppingSpend, type RateSettings } from './spending'

export type ShoppingDisplayState = 'to_buy' | 'partial' | 'purchased' | 'cancelled'

/**
 * Database status rule: "purchased" only when everything is bought; a partial purchase keeps
 * "to_buy" and is shown as "partial" in the UI.
 */
export function deriveShoppingStatus(
  quantity: number,
  purchasedQuantity: number,
  cancelled: boolean,
): ShoppingStatus {
  if (cancelled) return 'cancelled'
  return purchasedQuantity >= quantity ? 'purchased' : 'to_buy'
}

export function shoppingDisplayState(
  item: Pick<ShoppingItem, 'status' | 'quantity' | 'purchasedQuantity'>,
): ShoppingDisplayState {
  if (item.status === 'cancelled') return 'cancelled'
  if (item.purchasedQuantity >= item.quantity) return 'purchased'
  return item.purchasedQuantity > 0 ? 'partial' : 'to_buy'
}

export interface ShoppingTotals {
  currency: string
  /** Estimated cost of all non-cancelled items. */
  estimated: number
  /** Estimated cost of what is still left to buy. */
  remaining: number
  /** Spent so far: purchased quantity × actual price (estimate when no actual price). */
  spent: number
  itemsLeft: number
  itemsDone: number
  /** Items whose currency has no exchange rate to `currency`. */
  unconvertedCount: number
  /** Purchased items with no price at all. */
  missingPriceCount: number
}

export function computeShoppingTotals(
  items: readonly ShoppingItem[],
  currency: string,
  settings: RateSettings,
): ShoppingTotals {
  let estimated = 0
  let remaining = 0
  let spent = 0
  let itemsLeft = 0
  let itemsDone = 0
  let unconvertedCount = 0
  let missingPriceCount = 0
  const add = (amount: number, from: string): number | null => {
    const v = convertAmount(amount, from, currency, settings)
    return v === null ? null : toMinor(v, currency)
  }
  for (const item of items) {
    if (item.status === 'cancelled') continue
    if (item.purchasedQuantity >= item.quantity) itemsDone++
    else itemsLeft++
    let unconverted = false
    if (item.estimatedUnitPrice !== null && item.estimatedUnitPrice !== undefined) {
      const est = add(multiplyMoney(item.estimatedUnitPrice, item.quantity, item.currency), item.currency)
      const left = add(
        multiplyMoney(item.estimatedUnitPrice, item.quantity - item.purchasedQuantity, item.currency),
        item.currency,
      )
      if (est === null || left === null) unconverted = true
      else {
        estimated += est
        remaining += left
      }
    }
    const spend = shoppingSpend(item)
    if (spend) {
      const s = add(spend.amount, item.currency)
      if (s === null) unconverted = true
      else spent += s
    } else if (item.purchasedQuantity > 0) {
      missingPriceCount++
    }
    if (unconverted) unconvertedCount++
  }
  return {
    currency,
    estimated: fromMinor(estimated, currency),
    remaining: fromMinor(remaining, currency),
    spent: fromMinor(spent, currency),
    itemsLeft,
    itemsDone,
    unconvertedCount,
    missingPriceCount,
  }
}
