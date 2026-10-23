import { useMemo, useState } from 'react'
import { Ban, Check, LayoutGrid, List, Pencil, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { QuickPurchaseSheet, ShoppingCard, ShoppingRow, ShoppingSummary } from '@/components/shopping/ShoppingParts'
import { ShoppingFormSheet } from '@/components/shopping/ShoppingFormSheet'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { ImageViewer } from '@/components/ui/Images'
import { Card, Chips, EmptyState, Fab, PageLoader, SearchInput } from '@/components/ui/Primitives'
import { ActionSheet } from '@/components/ui/Sheet'
import { useConfirm } from '@/hooks/useConfirm'
import { usePlaces, useShoppingItems } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { formatMoney } from '@/i18n/format'
import { deleteShoppingItem, setCancelled, setPurchasedQuantity, togglePurchased } from '@/services/shoppingService'
import { showToast } from '@/stores/uiStore'
import type { ShoppingItem } from '@/types/entities'
import { computeShoppingTotals } from '@/utils/shopping'
import { readLocal, writeLocal } from '@/utils/storage'

type StatusFilter = 'all' | 'to_buy' | 'purchased' | 'cancelled'
const VIEW_KEY = 'travo:shoppingView'

export function ShoppingPage() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const { trip, settings } = useTripContext()
  const items = useShoppingItems(trip.id)
  const places = usePlaces(trip.id)
  const confirm = useConfirm()
  const [view, setView] = useState<'grid' | 'list'>(() => (readLocal(VIEW_KEY) === 'list' ? 'list' : 'grid'))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('to_buy')
  const [recipient, setRecipient] = useState('')
  const [store, setStore] = useState('')
  const [editing, setEditing] = useState<ShoppingItem | 'new' | null>(null)
  const [quick, setQuick] = useState<ShoppingItem | null>(null)
  const [menuItem, setMenuItem] = useState<ShoppingItem | null>(null)
  const [viewing, setViewing] = useState<ShoppingItem | null>(null)

  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places])
  const recipients = useMemo(() => [...new Set((items ?? []).map((i) => i.recipient).filter((r): r is string => !!r))].sort(), [items])
  const storeIds = useMemo(() => [...new Set((items ?? []).map((i) => i.shopPlaceId).filter((s): s is string => !!s))], [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (recipient && i.recipient !== recipient) return false
      if (store && i.shopPlaceId !== store) return false
      if (!q) return true
      return [i.name, i.description, i.recipient, i.notes].some((s) => s?.toLowerCase().includes(q))
    })
  }, [items, query, status, recipient, store])

  if (!items || !places) return <PageLoader />

  const totals = computeShoppingTotals(items, settings.displayCurrency, settings)
  const count = (s: StatusFilter) => (s === 'all' ? items.length : items.filter((i) => i.status === s).length)
  const switchView = (v: 'grid' | 'list') => {
    setView(v)
    writeLocal(VIEW_KEY, v)
  }

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  const check = (item: ShoppingItem) => {
    if (item.quantity > 1 && item.purchasedQuantity < item.quantity) {
      setQuick(item)
      return
    }
    const previous = item.purchasedQuantity
    void run(async () => {
      const next = await togglePurchased(item.id)
      showToast(next.status === 'purchased' ? t('shopping.purchasedToast', { name: item.name }) : t('shopping.unpurchasedToast'), {
        action: { label: t('common.undo'), onClick: () => void run(() => setPurchasedQuantity(item.id, previous)) },
      })
    })
  }

  const remove = async (item: ShoppingItem) => {
    if (await confirm({ title: t('shopping.deleteTitle'), message: item.name, confirmLabel: t('common.delete'), danger: true })) {
      await run(() => deleteShoppingItem(item.id))
      showToast(t('shopping.deleted'))
    }
  }

  const storeName = (i: ShoppingItem) => (i.shopPlaceId ? placeById.get(i.shopPlaceId)?.name : undefined)
  const viewProps = (i: ShoppingItem) => ({
    item: i,
    storeName: storeName(i),
    onOpen: () => setMenuItem(i),
    onCheck: () => check(i),
    onImage: () => (i.imageId ? setViewing(i) : setMenuItem(i)),
  })

  return (
    <>
      <PageHeader
        title={t('shopping.title')}
        subtitle={trip.name}
        actions={
          <IconButton
            icon={view === 'grid' ? List : LayoutGrid}
            label={view === 'grid' ? t('shopping.listView') : t('shopping.gridView')}
            onClick={() => switchView(view === 'grid' ? 'list' : 'grid')}
          />
        }
      />
      <PageBody withFab>
        {items.length === 0 ? (
          <EmptyState icon={ShoppingBag} title={t('shopping.emptyTitle')} message={t('shopping.emptyMessage')} />
        ) : (
          <div className="flex flex-col gap-4">
            <ShoppingSummary totals={totals} />
            <SearchInput value={query} onChange={setQuery} placeholder={t('shopping.search')} />
            <Chips
              label={t('shopping.statusFilter')}
              value={status}
              onChange={setStatus}
              options={[
                { value: 'to_buy', label: t('shoppingState.to_buy'), count: count('to_buy') },
                { value: 'purchased', label: t('shoppingState.purchased'), count: count('purchased') },
                { value: 'all', label: t('common.all'), count: count('all') },
                { value: 'cancelled', label: t('shoppingState.cancelled'), count: count('cancelled') },
              ]}
            />
            {(recipients.length > 0 || storeIds.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                <Select value={recipient} onChange={(e) => setRecipient(e.target.value)} aria-label={t('shopping.recipient')} className="h-10">
                  <option value="">{t('shopping.allRecipients')}</option>
                  {recipients.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <Select value={store} onChange={(e) => setStore(e.target.value)} aria-label={t('shopping.store')} className="h-10">
                  <option value="">{t('shopping.allStores')}</option>
                  {storeIds.map((id) => (
                    <option key={id} value={id}>
                      {placeById.get(id)?.name ?? '—'}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-muted">{status === 'to_buy' && !query ? t('shopping.allDone') : t('common.noResults')}</p>
            ) : view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 min-[540px]:grid-cols-3">
                {filtered.map((i) => (
                  <li key={i.id} className="flex">
                    <ShoppingCard {...viewProps(i)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {filtered.map((i) => (
                  <ShoppingRow key={i.id} {...viewProps(i)} />
                ))}
              </Card>
            )}
          </div>
        )}
      </PageBody>
      <Fab label={t('shopping.add')} onClick={() => setEditing('new')} />
      <ShoppingFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        tripId={trip.id}
        baseCurrency={settings.baseCurrency}
        places={places}
        recipients={recipients}
        item={editing === 'new' ? null : editing}
      />
      <QuickPurchaseSheet item={quick} onClose={() => setQuick(null)} />
      <ImageViewer
        id={viewing?.imageId ?? null}
        caption={viewing?.name}
        subcaption={viewing ? [`×${viewing.quantity}`, viewing.estimatedUnitPrice != null && formatMoney(viewing.estimatedUnitPrice, viewing.currency, locale)].filter(Boolean).join(' · ') : undefined}
        onClose={() => setViewing(null)}
      />
      <ActionSheet
        open={!!menuItem}
        onClose={() => setMenuItem(null)}
        title={menuItem?.name}
        actions={
          menuItem
            ? [
                { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(menuItem) },
                ...(menuItem.status !== 'cancelled'
                  ? [
                      { label: t('shopping.recordPurchase'), icon: Check, onSelect: () => setQuick(menuItem) },
                      { label: t('shopping.cancelItem'), icon: Ban, onSelect: () => void run(() => setCancelled(menuItem.id, true)) },
                    ]
                  : [{ label: t('shopping.restoreItem'), icon: RotateCcw, onSelect: () => void run(() => setCancelled(menuItem.id, false)) }]),
                { label: t('common.delete'), icon: Trash2, tone: 'danger' as const, onSelect: () => void remove(menuItem) },
              ]
            : []
        }
      />
    </>
  )
}
