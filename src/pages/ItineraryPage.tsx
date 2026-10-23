import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowRightLeft, Ban, CalendarX2, Check, Copy, ListOrdered, MapPin, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { ActivityCard } from '@/components/itinerary/ActivityCard'
import { ActivityFormSheet, DayEditSheet, MoveActivitySheet } from '@/components/itinerary/ActivitySheets'
import { DaySelector } from '@/components/itinerary/DaySelector'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, Fab, PageLoader, SectionTitle } from '@/components/ui/Primitives'
import { ActionSheet, type ActionItem } from '@/components/ui/Sheet'
import { useConfirm } from '@/hooks/useConfirm'
import { useActivities, usePlaces } from '@/hooks/useData'
import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { formatDate } from '@/i18n/format'
import { deleteActivity, duplicateActivity, reorderDay, setActivityStatus } from '@/services/itineraryService'
import { showToast } from '@/stores/uiStore'
import type { Activity, TripDay } from '@/types/entities'
import { buildPlaceUrl, canOpenInMaps } from '@/utils/maps'
import { findCurrentOrNext, findOverlaps, splitSchedule } from '@/utils/schedule'
import { gmtOffsetLabel, todayInTimeZone } from '@/utils/time'

export function ItineraryPage() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const { trip, days } = useTripContext()
  const [params, setParams] = useSearchParams()
  const activities = useActivities(trip.id)
  const places = usePlaces(trip.id)
  const now = useNow(30_000)
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Activity | 'new' | null>(null)
  const [menuActivity, setMenuActivity] = useState<Activity | null>(null)
  const [moving, setMoving] = useState<Activity | null>(null)
  const [editingDay, setEditingDay] = useState<TripDay | null>(null)
  const [reordering, setReordering] = useState(false)

  const today = todayInTimeZone(trip.timezone, now)
  const requested = params.get('day')
  const day =
    days.find((d) => d.date === requested) ?? days.find((d) => d.date === today) ?? days[0]
  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places])
  const dayActivities = useMemo(() => (activities ?? []).filter((a) => a.tripDayId === day?.id), [activities, day])
  const overlaps = useMemo(() => findOverlaps(dayActivities), [dayActivities])
  const upcoming = useMemo(() => (activities ? findCurrentOrNext(days, activities, trip.timezone, now) : null), [activities, days, trip.timezone, now])

  if (!activities || !places) return <PageLoader />
  if (!day) return <EmptyState icon={CalendarX2} title={t('itinerary.noDays')} />

  const { scheduled, unscheduled } = splitSchedule(dayActivities)
  const selectDay = (d: TripDay) => {
    setReordering(false)
    setParams({ day: d.date }, { replace: true })
  }

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn()
      if (success) showToast(success, { tone: 'success' })
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  const toggleComplete = (a: Activity) => run(() => setActivityStatus(a.id, a.status === 'completed' ? 'planned' : 'completed'))

  const remove = async (a: Activity) => {
    if (await confirm({ title: t('activity.deleteTitle'), message: a.title, confirmLabel: t('common.delete'), danger: true })) {
      await run(() => deleteActivity(a.id), t('activity.deleted'))
    }
  }

  const move = (list: Activity[], index: number, delta: number) => {
    const ids = list.map((a) => a.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + delta, 0, item)
    void run(() => reorderDay(day.id, ids))
  }

  const menuActions = (a: Activity): ActionItem[] => {
    const place = a.placeId ? placeById.get(a.placeId) : undefined
    const items: ActionItem[] = [
      { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(a) },
      { label: t('common.duplicate'), icon: Copy, onSelect: () => void run(() => duplicateActivity(a.id), t('activity.duplicated')) },
      { label: t('activity.moveToDay'), icon: ArrowRightLeft, onSelect: () => setMoving(a) },
      a.status === 'completed'
        ? { label: t('activity.markPlanned'), icon: RotateCcw, onSelect: () => void run(() => setActivityStatus(a.id, 'planned')) }
        : { label: t('activity.markDone'), icon: Check, onSelect: () => void run(() => setActivityStatus(a.id, 'completed')) },
      a.status === 'skipped'
        ? { label: t('activity.unskip'), icon: RotateCcw, onSelect: () => void run(() => setActivityStatus(a.id, 'planned')) }
        : { label: t('activity.skip'), icon: Ban, onSelect: () => void run(() => setActivityStatus(a.id, 'skipped')) },
    ]
    if (place && canOpenInMaps(place)) {
      items.push({ label: t('maps.open'), icon: MapPin, onSelect: () => window.open(buildPlaceUrl(place), '_blank', 'noopener,noreferrer') })
    }
    items.push({ label: t('common.delete'), icon: Trash2, tone: 'danger', onSelect: () => void remove(a) })
    return items
  }

  const highlightOf = (a: Activity): 'current' | 'next' | undefined =>
    upcoming && upcoming.activity.id === a.id ? (upcoming.isCurrent ? 'current' : 'next') : undefined

  const card = (a: Activity, reorder?: { onUp?: () => void; onDown?: () => void }) => (
    <li key={a.id}>
      <ActivityCard
        activity={a}
        place={a.placeId ? placeById.get(a.placeId) : undefined}
        highlight={highlightOf(a)}
        overlapsWith={overlaps.get(a.id)}
        onToggleComplete={() => void toggleComplete(a)}
        onMenu={() => setMenuActivity(a)}
        onOpen={() => setEditing(a)}
        reorder={reorder}
      />
    </li>
  )

  return (
    <>
      <PageHeader title={t('itinerary.title')} subtitle={`${trip.name} · ${t('itinerary.localTime', { tz: gmtOffsetLabel(trip.timezone, now) })}`} />
      <PageBody withFab>
        <div className="flex flex-col gap-5">
          <DaySelector days={days} selectedId={day.id} today={today} onSelect={selectDay} />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-muted">
                {t('itinerary.dayN', { n: day.dayOrder })}
                {day.date === today && <span className="ml-1.5 text-success">· {t('itinerary.today')}</span>}
              </p>
              <h2 className="text-xl font-bold">{formatDate(day.date, locale, 'long')}</h2>
              {day.title && <p className="mt-0.5 text-[15px] font-medium text-primary">{day.title}</p>}
              {day.notes && <p className="mt-1.5 text-[14px] whitespace-pre-line text-muted">{day.notes}</p>}
            </div>
            <IconButton icon={Pencil} label={t('itinerary.editDay')} variant="secondary" size="sm" onClick={() => setEditingDay(day)} />
          </div>

          {dayActivities.length === 0 ? (
            <EmptyState icon={CalendarX2} title={t('itinerary.emptyDay')} message={t('itinerary.emptyDayMessage')}>
              <Button onClick={() => setEditing('new')}>{t('activity.add')}</Button>
            </EmptyState>
          ) : (
            <>
              {scheduled.length > 0 && (
                <section>
                  <SectionTitle>{t('itinerary.scheduled')}</SectionTitle>
                  <ul className="flex flex-col gap-3">{scheduled.map((a) => card(a))}</ul>
                </section>
              )}
              {unscheduled.length > 0 && (
                <section>
                  <SectionTitle
                    action={
                      unscheduled.length > 1 && (
                        <Button size="sm" variant={reordering ? 'primary' : 'ghost'} icon={ListOrdered} onClick={() => setReordering((v) => !v)}>
                          {reordering ? t('common.done') : t('itinerary.reorder')}
                        </Button>
                      )
                    }
                  >
                    {t('itinerary.unscheduled')}
                  </SectionTitle>
                  <ul className="flex flex-col gap-3">
                    {unscheduled.map((a, i) =>
                      card(
                        a,
                        reordering
                          ? {
                              onUp: i > 0 ? () => move(unscheduled, i, -1) : undefined,
                              onDown: i < unscheduled.length - 1 ? () => move(unscheduled, i, 1) : undefined,
                            }
                          : undefined,
                      ),
                    )}
                  </ul>
                </section>
              )}
              {scheduled.length > 1 && <p className="text-center text-[13px] text-subtle">{t('itinerary.sortedByTime')}</p>}
            </>
          )}
        </div>
      </PageBody>
      <Fab label={t('activity.add')} onClick={() => setEditing('new')} />
      <ActivityFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        tripId={trip.id}
        days={days}
        places={places}
        activities={activities}
        activity={editing === 'new' ? null : editing}
        defaultDayId={day.id}
      />
      <ActionSheet open={!!menuActivity} onClose={() => setMenuActivity(null)} title={menuActivity?.title} actions={menuActivity ? menuActions(menuActivity) : []} />
      <MoveActivitySheet activity={moving} days={days} onClose={() => setMoving(null)} />
      <DayEditSheet day={editingDay} onClose={() => setEditingDay(null)} />
    </>
  )
}
