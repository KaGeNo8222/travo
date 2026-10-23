// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { createExpense, updateExpense } from '@/services/expenseService'
import {
  createShoppingItem,
  deleteShoppingItem,
  setCancelled,
  setPurchasedQuantity,
  togglePurchased,
  updateShoppingItem,
  type ShoppingInput,
} from '@/services/shoppingService'
import { updateTripSettings } from '@/services/tripService'
import type { ShoppingItem } from '@/types/entities'
import { ValidationError } from '@/utils/errors'
import { computeShoppingTotals, deriveShoppingStatus, shoppingDisplayState } from '@/utils/shopping'
import { buildSpendingLines, summarizeSpending } from '@/utils/spending'
import { makeTrip, pngBlob } from './helpers'

const item = (overrides: Partial<ShoppingInput> = {}): ShoppingInput => ({
  name: 'Tokyo Banana',
  quantity: 3,
  purchasedQuantity: 0,
  estimatedUnitPrice: 1200,
  currency: 'JPY',
  priority: 'medium',
  cancelled: false,
  ...overrides,
})
const imageFile = () => ({ blob: pngBlob(), filename: 'p.png', mimeType: 'image/png', size: 64 })

describe('shopping quantities and status', () => {
  it('derives a consistent status', () => {
    expect(deriveShoppingStatus(3, 0, false)).toBe('to_buy')
    expect(deriveShoppingStatus(3, 1, false)).toBe('to_buy')
    expect(deriveShoppingStatus(3, 3, false)).toBe('purchased')
    expect(deriveShoppingStatus(3, 3, true)).toBe('cancelled')
    expect(shoppingDisplayState({ status: 'to_buy', quantity: 3, purchasedQuantity: 1 })).toBe('partial')
  })

  it('rejects non-positive quantities and purchases above the quantity', async () => {
    const { trip } = await makeTrip()
    await expect(createShoppingItem(trip.id, item({ quantity: 0 }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createShoppingItem(trip.id, item({ purchasedQuantity: 4 }))).rejects.toMatchObject({
      issues: [{ path: 'purchasedQuantity', message: 'v.purchasedExceeds' }],
    })
    await expect(createShoppingItem(trip.id, item({ estimatedUnitPrice: -1 }))).rejects.toBeInstanceOf(ValidationError)
  })

  it('tracks partial and full purchases with timestamps', async () => {
    const { trip } = await makeTrip()
    const created = await createShoppingItem(trip.id, item())
    expect(created).toMatchObject({ status: 'to_buy', purchasedQuantity: 0, purchasedAt: null })
    const partial = await setPurchasedQuantity(created.id, 1, 1150)
    expect(partial).toMatchObject({ status: 'to_buy', purchasedQuantity: 1, actualUnitPrice: 1150 })
    expect(partial.purchasedAt).toBeTruthy()
    const full = await togglePurchased(created.id)
    expect(full).toMatchObject({ status: 'purchased', purchasedQuantity: 3 })
    const undone = await togglePurchased(created.id)
    expect(undone).toMatchObject({ status: 'to_buy', purchasedQuantity: 0, purchasedAt: null })
    expect((await setCancelled(created.id, true)).status).toBe('cancelled')
    await expect(setPurchasedQuantity(created.id, 5)).rejects.toBeInstanceOf(ValidationError)
  })

  it('stores, replaces and removes product images without orphans', async () => {
    const { trip } = await makeTrip()
    const created = await createShoppingItem(trip.id, item(), { kind: 'replace', file: imageFile() })
    const firstImage = created.imageId!
    expect((await db.attachments.get(firstImage))?.blob.size).toBe(64)

    const replaced = await updateShoppingItem(created.id, item(), { kind: 'replace', file: imageFile() })
    expect(replaced.imageId).not.toBe(firstImage)
    expect(await db.attachments.get(firstImage)).toBeUndefined()

    const kept = await updateShoppingItem(created.id, item({ name: 'Renamed' }))
    expect(kept.imageId).toBe(replaced.imageId)

    await deleteShoppingItem(created.id)
    expect(await db.attachments.count()).toBe(0)
  })

  it('keeps the old image when an edit is rejected', async () => {
    const { trip } = await makeTrip()
    const created = await createShoppingItem(trip.id, item(), { kind: 'replace', file: imageFile() })
    await expect(updateShoppingItem(created.id, item({ quantity: 0 }), { kind: 'remove' })).rejects.toBeInstanceOf(ValidationError)
    expect(await db.attachments.get(created.imageId!)).toBeDefined()
  })

  it('computes estimated, remaining and spent totals across currencies', () => {
    const ts = '2026-01-01T00:00:00.000Z'
    const base = { tripId: 't', priority: 'medium' as const, createdAt: ts, updatedAt: ts }
    const items: ShoppingItem[] = [
      { ...base, id: '1', name: 'A', quantity: 3, purchasedQuantity: 1, estimatedUnitPrice: 1000, actualUnitPrice: 900, currency: 'JPY', status: 'to_buy' },
      { ...base, id: '2', name: 'B', quantity: 1, purchasedQuantity: 1, estimatedUnitPrice: 100, currency: 'THB', status: 'purchased' },
      { ...base, id: '3', name: 'C', quantity: 1, purchasedQuantity: 0, estimatedUnitPrice: 5, currency: 'USD', status: 'to_buy' },
      { ...base, id: '4', name: 'D', quantity: 1, purchasedQuantity: 0, estimatedUnitPrice: 999, currency: 'JPY', status: 'cancelled' },
    ]
    const totals = computeShoppingTotals(items, 'THB', { baseCurrency: 'JPY', exchangeRateToTHB: 0.25 })
    expect(totals).toMatchObject({
      estimated: 850, // 3000 JPY → 750 + 100 THB (USD has no rate)
      remaining: 500, // 2000 JPY → 500
      spent: 325, // 900 JPY → 225 + 100
      itemsLeft: 2,
      itemsDone: 1,
      unconvertedCount: 1,
    })
  })
})

describe('expenses', () => {
  it('rejects negative amounts and unsupported currencies', async () => {
    const { trip } = await makeTrip()
    const base = { description: 'x', currency: 'JPY', expenseDate: '2026-11-10', category: 'food' }
    await expect(createExpense(trip.id, { ...base, amount: -1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(createExpense(trip.id, { ...base, amount: 1, currency: 'ABC' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('computes THB from the trip rate or an explicit per-expense rate, and follows rate changes', async () => {
    const { trip } = await makeTrip()
    const noRate = await createExpense(trip.id, { description: 'Ramen', amount: 1180, currency: 'JPY', expenseDate: '2026-11-10', category: 'food' })
    expect(noRate.amountTHB).toBeNull()

    await updateTripSettings(trip.id, { exchangeRateToTHB: 0.235 })
    expect((await db.expenses.get(noRate.id))?.amountTHB).toBe(277.3)

    const explicit = await createExpense(trip.id, {
      description: 'Card payment',
      amount: 10000,
      currency: 'JPY',
      exchangeRateToTHB: 0.24,
      expenseDate: '2026-11-11',
      category: 'shopping',
    })
    expect(explicit.amountTHB).toBe(2400)

    await updateTripSettings(trip.id, { exchangeRateToTHB: 0.2 })
    expect((await db.expenses.get(noRate.id))?.amountTHB).toBe(236) // follows the trip rate
    expect((await db.expenses.get(explicit.id))?.amountTHB).toBe(2400) // keeps its own rate

    const thb = await createExpense(trip.id, { description: 'SIM', amount: 299.999, currency: 'THB', expenseDate: '2026-11-10', category: 'other' })
    expect(thb).toMatchObject({ amount: 300, amountTHB: 300, exchangeRateToTHB: null })
  })

  it('never double counts a shopping item that has a linked expense', async () => {
    const { trip } = await makeTrip()
    await updateTripSettings(trip.id, { exchangeRateToTHB: 0.25 })
    const bought = await createShoppingItem(trip.id, item({ quantity: 2, purchasedQuantity: 2, actualUnitPrice: 1000 }))
    const other = await createShoppingItem(trip.id, item({ name: 'Sunscreen', quantity: 1, purchasedQuantity: 1, actualUnitPrice: 2000 }))
    const expense = await createExpense(trip.id, { description: 'Taxi', amount: 4000, currency: 'JPY', expenseDate: '2026-11-10', category: 'transport' })

    const settings = (await db.trip_settings.get(trip.id))!
    const items = await db.shopping_items.where('tripId').equals(trip.id).toArray()
    let lines = buildSpendingLines([expense], items, settings, trip.timezone)
    expect(summarizeSpending(lines, 'JPY', settings).total).toBe(8000) // 4000 + 2000 + 2000

    // Linking an expense to an item replaces that item's computed amount.
    const receipt = await updateExpense(expense.id, {
      description: 'Banana receipt',
      amount: 1900,
      currency: 'JPY',
      expenseDate: '2026-11-10',
      category: 'shopping',
      shoppingItemId: bought.id,
    })
    lines = buildSpendingLines([receipt], items, settings, trip.timezone)
    const summary = summarizeSpending(lines, 'THB', settings)
    expect(lines.map((l) => l.refId).sort()).toEqual([expense.id, other.id].sort())
    expect(summary.total).toBe(975) // (1900 + 2000) JPY × 0.25
    expect(summary.byCategory).toEqual([{ category: 'shopping', total: 975 }])
  })
})
