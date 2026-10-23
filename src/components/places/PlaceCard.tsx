import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { CalendarPlus, Check, Clock, Ellipsis } from 'lucide-react'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { formatDate } from '@/i18n/format'
import { categoryLabel } from '@/i18n/labels'
import { addPlaceToDay } from '@/services/itineraryService'
import { showToast } from '@/stores/uiStore'
import type { Category, Place, TripDay } from '@/types/entities'
import { cn } from '@/utils/cn'
import { Field, FormError, TextInput } from '../ui/Field'
import { Card } from '../ui/Primitives'
import { Sheet, SheetSubmit } from '../ui/Sheet'
import { categoryIcon } from './categoryIcons'
import { MapsButton } from './MapsLinks'

interface PlaceCardProps {
  place: Place
  category: Category | undefined
  onMenu: () => void
  onToggleVisited: () => void
  onAddToDay: () => void
}

export function PlaceCard({ place, category, onMenu, onToggleVisited, onAddToDay }: PlaceCardProps) {
  const i18n = useI18n()
  const { t } = i18n
  const Icon = categoryIcon(category?.icon)
  const color = category?.color ?? '#6b7280'
  return (
    <Card className={cn('p-4', place.isVisited && 'opacity-75')}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1f`, color }}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] leading-snug font-semibold">{place.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {category ? categoryLabel(category, i18n) : t('placeCategory.other')}
            {place.address && <> · {place.address}</>}
          </p>
          {place.openingHoursNote && (
            <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {place.openingHoursNote}
            </p>
          )}
          {place.notes && <p className="mt-1.5 line-clamp-2 text-[14px] text-fg/80">{place.notes}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleVisited}
          aria-pressed={place.isVisited}
          aria-label={place.isVisited ? t('place.markNotVisited') : t('place.markVisited')}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            place.isVisited ? 'border-success bg-success text-white' : 'border-line text-transparent active:bg-surface-2',
          )}
        >
          <Check className="size-5" strokeWidth={3} aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MapsButton place={place} />
        <MapsButton place={place} kind="directions" />
        <button
          type="button"
          onClick={onAddToDay}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm font-semibold active:bg-line"
        >
          <CalendarPlus className="size-4" aria-hidden />
          {t('place.addToDay')}
        </button>
        <button
          type="button"
          onClick={onMenu}
          aria-label={t('common.moreActions')}
          className="ml-auto flex size-9 items-center justify-center rounded-full text-muted active:bg-surface-2"
        >
          <Ellipsis className="size-5" aria-hidden />
        </button>
      </div>
    </Card>
  )
}

interface AddToDaySheetProps {
  place: Place | null
  days: TripDay[]
  defaultDayId?: string
  onClose: () => void
}

export function AddToDaySheet(props: AddToDaySheetProps) {
  if (!props.place) return null
  return <AddToDayForm {...props} place={props.place} />
}

function AddToDayForm({ place, days, defaultDayId, onClose }: AddToDaySheetProps & { place: Place }) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const navigate = useNavigate()
  const formId = useId()
  const [dayId, setDayId] = useState(defaultDayId ?? days[0]?.id ?? '')
  const [time, setTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const activity = await addPlaceToDay(place.id, dayId, time || undefined)
      const day = days.find((d) => d.id === activity.tripDayId)
      onClose()
      showToast(t('place.addedToDay', { day: day ? formatDate(day.date, locale, 'weekday') : '' }), {
        tone: 'success',
        action: day ? { label: t('place.viewPlan'), onClick: () => navigate(`/trip/${place.tripId}/plan?day=${day.date}`) } : undefined,
      })
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('place.addToDayTitle')} footer={<SheetSubmit form={formId} label={t('common.add')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <p className="text-[15px] font-semibold">{place.name}</p>
        <FormError message={error} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-muted">{t('place.chooseDay')}</legend>
          {days.map((d) => (
            <label
              key={d.id}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5',
                dayId === d.id ? 'border-primary bg-primary-soft' : 'border-line',
              )}
            >
              <input type="radio" name="day" value={d.id} checked={dayId === d.id} onChange={() => setDayId(d.id)} className="size-5 accent-[var(--app-primary)]" />
              <span className="font-medium">{t('itinerary.dayN', { n: d.dayOrder })}</span>
              <span className="text-muted">{formatDate(d.date, locale, 'weekday')}</span>
              {d.title && <span className="truncate text-sm text-subtle">· {d.title}</span>}
            </label>
          ))}
        </fieldset>
        <Field label={t('activity.startTime')} htmlFor={`${formId}-time`} optional={t('common.optional')}>
          <TextInput id={`${formId}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
