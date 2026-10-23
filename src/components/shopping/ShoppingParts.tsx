import { useId, useState, type FormEvent } from 'react'
import { Check, Gift, ShoppingBag, Store } from 'lucide-react'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { formatMoney } from '@/i18n/format'
import { PRIORITY_LABEL, SHOPPING_STATE_LABEL } from '@/i18n/labels'
import { setPurchasedQuantity } from '@/services/shoppingService'
import type { ShoppingItem } from '@/types/entities'
import { cn } from '@/utils/cn'
import { amountToInput, multiplyMoney, parseAmountInput } from '@/utils/money'
import { shoppingDisplayState, type ShoppingDisplayState, type ShoppingTotals } from '@/utils/shopping'
import { Field, FormError, TextInput } from '../ui/Field'
import { AttachmentImage } from '../ui/Images'
import { Badge, Card, ProgressBar, Stepper, type BadgeTone } from '../ui/Primitives'
import { Sheet, SheetSubmit } from '../ui/Sheet'

export const STATE_TONE: Record<ShoppingDisplayState, BadgeTone> = {
  to_buy: 'primary',
  partial: 'warning',
  purchased: 'success',
  cancelled: 'neutral',
}

function priceLine(item: ShoppingItem, locale: string): string | null {
  const unit = item.actualUnitPrice ?? item.estimatedUnitPrice
  if (unit === null || unit === undefined) return null
  const price = formatMoney(unit, item.currency, locale)
  return item.quantity > 1 ? `${price} × ${item.quantity}` : price
}

interface ItemViewProps {
  item: ShoppingItem
  storeName?: string
  onOpen: () => void
  onCheck: () => void
  onImage: () => void
}

/** Image-first card for browsing while shopping. */
export function ShoppingCard({ item, storeName, onOpen, onCheck, onImage }: ItemViewProps) {
  const { t, locale } = useI18n()
  const state = shoppingDisplayState(item)
  const done = state === 'purchased'
  const price = priceLine(item, locale)
  return (
    <Card className={cn('relative flex w-full flex-col overflow-hidden', state === 'cancelled' && 'opacity-55')}>
      <button type="button" onClick={item.imageId ? onImage : onOpen} className="relative block aspect-square w-full bg-surface-2" aria-label={item.imageId ? t('shopping.viewImage', { name: item.name }) : item.name}>
        <AttachmentImage id={item.imageId} alt={item.name} className="size-full" fallbackIcon={ShoppingBag} />
        {done && <span className="absolute inset-0 bg-success/25" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onCheck}
        disabled={state === 'cancelled'}
        aria-pressed={done}
        aria-label={done ? t('shopping.markNotPurchased') : t('shopping.markPurchased')}
        className={cn(
          'absolute top-2 right-2 flex size-11 items-center justify-center rounded-full border-2 shadow-md transition-colors disabled:hidden',
          done ? 'border-success bg-success text-white' : 'border-white bg-black/30 text-white backdrop-blur-sm active:bg-black/50',
        )}
      >
        <Check className="size-5" strokeWidth={3} aria-hidden />
      </button>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-1 p-3 text-left active:bg-surface-2">
        <span className={cn('line-clamp-2 text-[15px] leading-snug font-semibold', done && 'text-muted')}>{item.name}</span>
        {price && <span className="text-[14px] font-medium tabular-nums">{price}</span>}
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge tone={STATE_TONE[state]}>
            {state === 'partial' ? t('shopping.partialCount', { done: item.purchasedQuantity, total: item.quantity }) : t(SHOPPING_STATE_LABEL[state])}
          </Badge>
          {item.priority === 'high' && state !== 'purchased' && <Badge tone="danger">{t(PRIORITY_LABEL.high)}</Badge>}
        </span>
        {(item.recipient || storeName) && (
          <span className="flex flex-col gap-0.5 text-[12px] text-muted">
            {item.recipient && (
              <span className="flex items-center gap-1 truncate">
                <Gift className="size-3.5 shrink-0" aria-hidden />
                {item.recipient}
              </span>
            )}
            {storeName && (
              <span className="flex items-center gap-1 truncate">
                <Store className="size-3.5 shrink-0" aria-hidden />
                {storeName}
              </span>
            )}
          </span>
        )}
      </button>
    </Card>
  )
}

/** Compact checklist row. */
export function ShoppingRow({ item, storeName, onOpen, onCheck, onImage }: ItemViewProps) {
  const { t, locale } = useI18n()
  const state = shoppingDisplayState(item)
  const done = state === 'purchased'
  const price = priceLine(item, locale)
  return (
    <div className={cn('flex items-center gap-3 px-3 py-2.5', state === 'cancelled' && 'opacity-55')}>
      <button
        type="button"
        onClick={onCheck}
        disabled={state === 'cancelled'}
        aria-pressed={done}
        aria-label={done ? t('shopping.markNotPurchased') : t('shopping.markPurchased')}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-success bg-success text-white' : state === 'partial' ? 'border-warning text-warning' : 'border-line text-transparent',
        )}
      >
        {state === 'partial' ? <span className="text-[11px] font-bold">{item.purchasedQuantity}</span> : <Check className="size-4" strokeWidth={3} aria-hidden />}
      </button>
      <button type="button" onClick={onImage} disabled={!item.imageId} className="size-12 shrink-0 overflow-hidden rounded-lg" aria-label={t('shopping.viewImage', { name: item.name })}>
        <AttachmentImage id={item.imageId} alt="" className="size-full" fallbackIcon={ShoppingBag} />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-[15px] font-medium', (done || state === 'cancelled') && 'text-muted line-through')}>{item.name}</span>
        <span className="block truncate text-[12px] text-muted">
          {[`×${item.quantity}`, price, item.recipient, storeName].filter(Boolean).join(' · ')}
        </span>
      </button>
    </div>
  )
}

export function ShoppingSummary({ totals }: { totals: ShoppingTotals }) {
  const { t, locale } = useI18n()
  const count = totals.itemsDone + totals.itemsLeft
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] text-muted">{t('shopping.estimatedTotal')}</p>
          <p className="text-[19px] font-bold tabular-nums">{formatMoney(totals.estimated, totals.currency, locale)}</p>
        </div>
        <div>
          <p className="text-[12px] text-muted">{t('shopping.spent')}</p>
          <p className="text-[19px] font-bold text-success tabular-nums">{formatMoney(totals.spent, totals.currency, locale)}</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar value={count ? totals.itemsDone / count : 0} tone="success" label={t('shopping.progress')} />
        <p className="mt-1.5 text-[13px] text-muted">
          {t('shopping.progressText', { done: totals.itemsDone, total: count })} · {t('shopping.estimatedLeft', { amount: formatMoney(totals.remaining, totals.currency, locale) })}
        </p>
      </div>
      {(totals.unconvertedCount > 0 || totals.missingPriceCount > 0) && (
        <p className="mt-2 text-[12px] text-warning">
          {[
            totals.unconvertedCount > 0 && t('shopping.unconverted', { count: totals.unconvertedCount }),
            totals.missingPriceCount > 0 && t('shopping.missingPrice', { count: totals.missingPriceCount }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <p className="mt-2 text-[12px] text-subtle">{t('shopping.sourceOfTruth')}</p>
    </Card>
  )
}

export function QuickPurchaseSheet({ item, onClose }: { item: ShoppingItem | null; onClose: () => void }) {
  if (!item) return null
  return <QuickPurchaseForm item={item} onClose={onClose} />
}

function QuickPurchaseForm({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const formId = useId()
  const [qty, setQty] = useState(item.purchasedQuantity >= item.quantity ? item.quantity : Math.max(item.purchasedQuantity, 1))
  const [price, setPrice] = useState(amountToInput(item.actualUnitPrice ?? item.estimatedUnitPrice, item.currency))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const unit = parseAmountInput(price)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (unit !== null && (!Number.isFinite(unit) || unit < 0)) {
      setError(t('v.nonNegative'))
      return
    }
    setSaving(true)
    try {
      await setPurchasedQuantity(item.id, qty, unit)
      onClose()
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('shopping.quickTitle')} size="auto" footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-xl">
            <AttachmentImage id={item.imageId} alt="" className="size-full" fallbackIcon={ShoppingBag} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{item.name}</p>
            <p className="text-[13px] text-muted">{t('shopping.wanted', { n: item.quantity })}</p>
          </div>
        </div>
        <FormError message={error} />
        <Field label={t('shopping.purchasedQty')}>
          <Stepper value={qty} onChange={setQty} min={0} max={item.quantity} label={t('shopping.purchasedQty')} />
        </Field>
        <Field label={t('shopping.actualUnitPrice', { currency: item.currency })} htmlFor={`${formId}-price`} optional={t('common.optional')}>
          <TextInput id={`${formId}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
        {unit !== null && Number.isFinite(unit) && unit >= 0 && qty > 0 && (
          <p className="text-[15px]">
            {t('shopping.lineTotal')}: <strong className="tabular-nums">{formatMoney(multiplyMoney(unit, qty, item.currency), item.currency, locale)}</strong>
          </p>
        )}
      </form>
    </Sheet>
  )
}
