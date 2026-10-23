import { db } from '@/db/database'
import { shoppingItemSchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Priority, ShoppingItem } from '@/types/entities'
import { IntegrityError, NotFoundError, ValidationError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'
import { roundMoney } from '@/utils/money'
import { deriveShoppingStatus } from '@/utils/shopping'
import { applyImageChange, deleteOwnerAttachments, KEEP_IMAGE, type ImageChange } from './attachmentService'
import { insertPlace, PLACE_WRITE_TABLES, type PlaceInput } from './placeService'

export interface ShoppingInput {
  name: string
  description?: string
  quantity: number
  purchasedQuantity: number
  estimatedUnitPrice?: number | null
  actualUnitPrice?: number | null
  currency: string
  shopPlaceId?: string | null
  recipient?: string
  priority: Priority
  cancelled: boolean
  notes?: string
}

const WRITE_TABLES = () => [db.trips, db.shopping_items, db.attachments, ...PLACE_WRITE_TABLES()]

function roundPrice(value: number | null | undefined, currency: string): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return value ?? null
  return roundMoney(value, currency)
}

/** Applies the status rule and purchase timestamp, then validates. */
function buildItem(base: ShoppingItem | null, fields: Omit<ShoppingItem, 'status' | 'purchasedAt' | 'updatedAt'> & { cancelled: boolean }): ShoppingItem {
  const { cancelled, ...rest } = fields
  const ts = nowIso()
  const purchasedChanged = !base || base.purchasedQuantity !== rest.purchasedQuantity
  return validate(shoppingItemSchema, {
    ...rest,
    estimatedUnitPrice: roundPrice(rest.estimatedUnitPrice, rest.currency),
    actualUnitPrice: roundPrice(rest.actualUnitPrice, rest.currency),
    status: deriveShoppingStatus(rest.quantity, rest.purchasedQuantity, cancelled),
    purchasedAt: rest.purchasedQuantity > 0 ? (purchasedChanged ? ts : (base?.purchasedAt ?? ts)) : null,
    updatedAt: ts,
  })
}

async function resolveShop(tripId: string, shopPlaceId: string | null | undefined, newShop?: PlaceInput): Promise<string | null> {
  if (newShop) return (await insertPlace(tripId, newShop)).id
  if (!shopPlaceId) return null
  const place = await db.places.get(shopPlaceId)
  if (!place || place.tripId !== tripId) throw new IntegrityError('error.invalidPlace')
  return place.id
}

export async function createShoppingItem(
  tripId: string,
  input: ShoppingInput,
  image: ImageChange = KEEP_IMAGE,
  options: { newShop?: PlaceInput } = {},
): Promise<ShoppingItem> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    if (!(await db.trips.get(tripId))) throw new NotFoundError('trip')
    const id = newId()
    const shopPlaceId = await resolveShop(tripId, input.shopPlaceId, options.newShop)
    const imageId = await applyImageChange({ tripId, ownerType: 'shopping', ownerId: id, currentId: null, change: image })
    const item = buildItem(null, { ...input, id, tripId, shopPlaceId, imageId, createdAt: nowIso() })
    await db.shopping_items.add(item)
    return item
  })
}

export async function updateShoppingItem(
  id: string,
  input: ShoppingInput,
  image: ImageChange = KEEP_IMAGE,
  options: { newShop?: PlaceInput } = {},
): Promise<ShoppingItem> {
  return db.transaction('rw', WRITE_TABLES(), async () => {
    const existing = await db.shopping_items.get(id)
    if (!existing) throw new NotFoundError('shopping')
    const shopPlaceId = await resolveShop(existing.tripId, input.shopPlaceId, options.newShop)
    // A validation error below aborts the transaction, so the old photo is never lost.
    const imageId = await applyImageChange({
      tripId: existing.tripId,
      ownerType: 'shopping',
      ownerId: id,
      currentId: existing.imageId,
      change: image,
    })
    const item = buildItem(existing, {
      ...existing,
      description: undefined,
      recipient: undefined,
      notes: undefined,
      ...input,
      shopPlaceId,
      imageId,
    })
    await db.shopping_items.put(item)
    return item
  })
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await db.transaction('rw', [db.shopping_items, db.attachments, db.expenses], async () => {
    await deleteOwnerAttachments('shopping', id)
    await db.expenses.where('shoppingItemId').equals(id).modify({ shoppingItemId: null })
    await db.shopping_items.delete(id)
  })
}

async function patchPurchase(
  id: string,
  change: (item: ShoppingItem) => { purchasedQuantity: number; actualUnitPrice?: number | null; cancelled?: boolean },
): Promise<ShoppingItem> {
  return db.transaction('rw', [db.shopping_items], async () => {
    const existing = await db.shopping_items.get(id)
    if (!existing) throw new NotFoundError('shopping')
    const { cancelled = existing.status === 'cancelled', ...patch } = change(existing)
    const item = buildItem(existing, { ...existing, ...patch, cancelled })
    await db.shopping_items.put(item)
    return item
  })
}

/** Quick purchase from the list: sets how many were bought (and optionally the price). */
export function setPurchasedQuantity(id: string, purchasedQuantity: number, actualUnitPrice?: number | null): Promise<ShoppingItem> {
  if (!Number.isInteger(purchasedQuantity) || purchasedQuantity < 0) {
    return Promise.reject(new ValidationError([{ path: 'purchasedQuantity', message: 'v.nonNegative' }]))
  }
  return patchPurchase(id, (item) => ({
    purchasedQuantity,
    actualUnitPrice: actualUnitPrice === undefined ? item.actualUnitPrice : actualUnitPrice,
    cancelled: false,
  }))
}

/** One-tap toggle: fully purchased ↔ nothing purchased. */
export function togglePurchased(id: string): Promise<ShoppingItem> {
  return patchPurchase(id, (item) => ({
    purchasedQuantity: item.purchasedQuantity >= item.quantity ? 0 : item.quantity,
    cancelled: false,
  }))
}

export function setCancelled(id: string, cancelled: boolean): Promise<ShoppingItem> {
  return patchPurchase(id, (item) => ({ purchasedQuantity: item.purchasedQuantity, cancelled }))
}
