import { useMemo, useState } from 'react'
import { Check, MapPinned, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { AddToDaySheet, PlaceCard } from '@/components/places/PlaceCard'
import { PlaceFormSheet } from '@/components/places/PlaceFormSheet'
import { Chips, EmptyState, Fab, PageLoader, SearchInput, SegmentedControl } from '@/components/ui/Primitives'
import { ActionSheet } from '@/components/ui/Sheet'
import { getPlaceUsage } from '@/db/repositories/placeRepository'
import { useConfirm } from '@/hooks/useConfirm'
import { useCategories, usePlaces } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { categoryLabel } from '@/i18n/labels'
import { deletePlace, setPlaceVisited } from '@/services/placeService'
import { showToast } from '@/stores/uiStore'
import type { Place } from '@/types/entities'
import { todayInTimeZone } from '@/utils/time'

type VisitFilter = 'all' | 'todo' | 'visited'

export function PlacesPage() {
  const i18n = useI18n()
  const { t } = i18n
  const { trip, days } = useTripContext()
  const places = usePlaces(trip.id)
  const categories = useCategories()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  const [menuPlace, setMenuPlace] = useState<Place | null>(null)
  const [addingToDay, setAddingToDay] = useState<Place | null>(null)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const catOf = (p: Place) => p.categoryId ?? p.category

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (places ?? []).filter((p) => {
      if (categoryFilter !== 'all' && catOf(p) !== categoryFilter) return false
      if (visitFilter === 'todo' && p.isVisited) return false
      if (visitFilter === 'visited' && !p.isVisited) return false
      if (!q) return true
      return [p.name, p.address, p.notes].some((s) => s?.toLowerCase().includes(q))
    })
  }, [places, query, categoryFilter, visitFilter])

  if (!places || !categories) return <PageLoader />

  const counts = new Map<string, number>()
  for (const p of places) counts.set(catOf(p), (counts.get(catOf(p)) ?? 0) + 1)
  const chipOptions = [
    { value: 'all', label: t('common.all'), count: places.length },
    ...categories.filter((c) => counts.has(c.id)).map((c) => ({ value: c.id, label: categoryLabel(c, i18n), count: counts.get(c.id) })),
  ]
  const today = todayInTimeZone(trip.timezone)
  const todayDay = days.find((d) => d.date === today)

  const toggleVisited = async (p: Place) => {
    try {
      await setPlaceVisited(p.id, !p.isVisited)
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  const remove = async (p: Place) => {
    const usage = await getPlaceUsage(p.id)
    const used = usage.activities + usage.shoppingItems + usage.bookings
    const ok = await confirm({
      title: t('place.deleteTitle', { name: p.name }),
      message: used ? t('place.deleteUsed', { activities: usage.activities, shopping: usage.shoppingItems, bookings: usage.bookings }) : t('place.deleteMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await deletePlace(p.id)
    showToast(t('place.deleted'))
  }

  return (
    <>
      <PageHeader title={t('places.title')} subtitle={t('places.subtitle', { count: places.length })} />
      <PageBody withFab>
        {places.length === 0 ? (
          <EmptyState icon={MapPinned} title={t('places.emptyTitle')} message={t('places.emptyMessage')} />
        ) : (
          <div className="flex flex-col gap-4">
            <SearchInput value={query} onChange={setQuery} placeholder={t('places.search')} />
            <Chips label={t('place.category')} value={categoryFilter} onChange={setCategoryFilter} options={chipOptions} />
            <SegmentedControl
              label={t('places.visitFilter')}
              value={visitFilter}
              onChange={setVisitFilter}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'todo', label: t('places.notVisited') },
                { value: 'visited', label: t('places.visited') },
              ]}
            />
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-muted">{t('common.noResults')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <PlaceCard
                      place={p}
                      category={categoryById.get(catOf(p))}
                      onMenu={() => setMenuPlace(p)}
                      onToggleVisited={() => void toggleVisited(p)}
                      onAddToDay={() => setAddingToDay(p)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </PageBody>
      <Fab label={t('places.add')} onClick={() => setEditing('new')} />
      <PlaceFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        tripId={trip.id}
        place={editing === 'new' ? null : editing}
        defaultCategoryId={categoryFilter !== 'all' ? categoryFilter : undefined}
      />
      <AddToDaySheet place={addingToDay} days={days} defaultDayId={todayDay?.id} onClose={() => setAddingToDay(null)} />
      <ActionSheet
        open={!!menuPlace}
        onClose={() => setMenuPlace(null)}
        title={menuPlace?.name}
        actions={
          menuPlace
            ? [
                { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(menuPlace) },
                {
                  label: menuPlace.isVisited ? t('place.markNotVisited') : t('place.markVisited'),
                  icon: menuPlace.isVisited ? Undo2 : Check,
                  onSelect: () => void toggleVisited(menuPlace),
                },
                { label: t('common.delete'), icon: Trash2, tone: 'danger', onSelect: () => void remove(menuPlace) },
              ]
            : []
        }
      />
    </>
  )
}
