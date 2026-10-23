import { useId, useMemo, useState, type FormEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { formatDate } from '@/i18n/format'
import { ACTIVITY_STATUS_LABEL, ACTIVITY_TYPE_LABEL, TRANSPORT_MODE_LABEL } from '@/i18n/labels'
import { createActivity, moveActivity, updateActivity, updateTripDay, type ActivityInput } from '@/services/itineraryService'
import { showToast } from '@/stores/uiStore'
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  TRANSPORT_MODES,
  type Activity,
  type ActivityStatus,
  type Place,
  type TransportMode,
  type TripDay,
} from '@/types/entities'
import { cn } from '@/utils/cn'
import { endsNextDay, findOverlaps } from '@/utils/schedule'
import { PlacePicker, placeChoiceArgs, placeChoiceFrom, type PlaceChoice } from '../places/PlacePicker'
import { Field, FieldRow, FormError, Select, TextArea, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/Primitives'
import { Sheet, SheetSubmit } from '../ui/Sheet'

interface ActivityFormSheetProps {
  open: boolean
  onClose: () => void
  tripId: string
  days: TripDay[]
  places: Place[]
  /** All activities of the trip (for overlap warnings). */
  activities: Activity[]
  activity?: Activity | null
  defaultDayId: string
}

export function ActivityFormSheet(props: ActivityFormSheetProps) {
  if (!props.open) return null
  return <ActivityForm {...props} />
}

function ActivityForm({ onClose, tripId, days, places, activities, activity, defaultDayId }: ActivityFormSheetProps) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const formId = useId()
  const [title, setTitle] = useState(activity?.title ?? '')
  const [placeChoice, setPlaceChoice] = useState<PlaceChoice>(placeChoiceFrom(activity?.placeId))
  const [dayId, setDayId] = useState(activity?.tripDayId ?? defaultDayId)
  const [startTime, setStartTime] = useState(activity?.startTime ?? '')
  const [endTime, setEndTime] = useState(activity?.endTime ?? '')
  const [activityType, setActivityType] = useState(activity?.activityType ?? '')
  const [transportMode, setTransportMode] = useState<TransportMode | ''>(activity?.transportMode ?? '')
  const [travelMinutes, setTravelMinutes] = useState(activity?.travelMinutes?.toString() ?? '')
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? 'planned')
  const [notes, setNotes] = useState(activity?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Live overlap preview against the other activities of the chosen day.
  const overlapping = useMemo(() => {
    if (!startTime) return []
    const draft: Activity = {
      ...(activity ?? { id: '__draft__', tripId, sortOrder: 0, createdAt: '', updatedAt: '', title: '' }),
      tripDayId: dayId,
      startTime,
      endTime: endTime || undefined,
      status: status === 'skipped' ? 'planned' : status,
    }
    const others = activities.filter((a) => a.tripDayId === dayId && a.id !== draft.id)
    const ids = findOverlaps([...others, draft]).get(draft.id) ?? []
    return others.filter((a) => ids.includes(a.id))
  }, [activities, activity, dayId, startTime, endTime, status, tripId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issues: Record<string, string> = {}
    const minutes = travelMinutes.trim() ? Number(travelMinutes) : undefined
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0)) issues.travelMinutes = t('v.integer')
    const { placeId, newPlace } = placeChoiceArgs(placeChoice)
    if (!title.trim() && !placeId && !newPlace) issues.title = t('v.titleOrPlace')
    setErrors(issues)
    setFormError(null)
    if (Object.keys(issues).length) return
    const input: ActivityInput = {
      tripDayId: dayId,
      placeId,
      title,
      startTime,
      endTime,
      activityType,
      transportMode: transportMode || undefined,
      travelMinutes: minutes,
      notes,
      status,
    }
    setSaving(true)
    try {
      if (activity) await updateActivity(activity.id, input, { newPlace })
      else await createActivity(tripId, input, { newPlace })
      showToast(t(activity ? 'common.saved' : 'activity.created'), { tone: 'success' })
      onClose()
    } catch (err) {
      const fields = fieldErrors(err, i18n)
      if (fields) setErrors(fields)
      else setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  const id = (f: string) => `${formId}-${f}`
  const overnight = endsNextDay({ startTime, endTime })

  return (
    <Sheet open onClose={onClose} title={activity ? t('activity.editTitle') : t('activity.newTitle')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('activity.title')} htmlFor={id('title')} error={errors.title} hint={t('activity.titleHint')}>
          <TextInput id={id('title')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('activity.titlePlaceholder')} invalid={!!errors.title} />
        </Field>
        <PlacePicker label={t('activity.place')} places={places} value={placeChoice} onChange={setPlaceChoice} urlError={errors.googleMapsUrl} />
        <Field label={t('activity.day')} htmlFor={id('day')}>
          <Select id={id('day')} value={dayId} onChange={(e) => setDayId(e.target.value)}>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {t('itinerary.dayN', { n: d.dayOrder })} · {formatDate(d.date, locale, 'weekday')}
              </option>
            ))}
          </Select>
        </Field>
        <FieldRow>
          <Field label={t('activity.startTime')} htmlFor={id('start')} optional={t('common.optional')} error={errors.startTime}>
            <TextInput id={id('start')} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} invalid={!!errors.startTime} />
          </Field>
          <Field label={t('activity.endTime')} htmlFor={id('end')} optional={t('common.optional')} error={errors.endTime} hint={overnight ? t('activity.overnightHint') : undefined}>
            <TextInput id={id('end')} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} invalid={!!errors.endTime} disabled={!startTime && !endTime} />
          </Field>
        </FieldRow>
        {overlapping.length > 0 && (
          <div role="status" className="flex gap-2.5 rounded-xl bg-warning-soft p-3.5 text-sm text-warning">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t('activity.overlapWarning')}</p>
              <ul className="mt-1">
                {overlapping.map((a) => (
                  <li key={a.id}>
                    {a.startTime}
                    {a.endTime && `–${a.endTime}`} {a.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <Field label={t('activity.type')} htmlFor={id('type')} optional={t('common.optional')}>
          <Select id={id('type')} value={activityType} onChange={(e) => setActivityType(e.target.value)}>
            <option value="">—</option>
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(ACTIVITY_TYPE_LABEL[type])}
              </option>
            ))}
            {activityType && !ACTIVITY_TYPES.includes(activityType as (typeof ACTIVITY_TYPES)[number]) && <option value={activityType}>{activityType}</option>}
          </Select>
        </Field>
        <FieldRow>
          <Field label={t('activity.transportMode')} htmlFor={id('mode')} optional={t('common.optional')}>
            <Select id={id('mode')} value={transportMode} onChange={(e) => setTransportMode(e.target.value as TransportMode | '')}>
              <option value="">—</option>
              {TRANSPORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(TRANSPORT_MODE_LABEL[m])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('activity.travelMinutes')} htmlFor={id('travel')} optional={t('common.optional')} error={errors.travelMinutes}>
            <TextInput id={id('travel')} inputMode="numeric" value={travelMinutes} onChange={(e) => setTravelMinutes(e.target.value.replace(/\D/g, ''))} placeholder="15" />
          </Field>
        </FieldRow>
        <p className="-mt-3 text-[13px] text-subtle">{t('activity.travelManualHint')}</p>
        {activity && (
          <Field label={t('activity.status')}>
            <SegmentedControl
              label={t('activity.status')}
              value={status}
              onChange={setStatus}
              options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: t(ACTIVITY_STATUS_LABEL[s]) }))}
            />
          </Field>
        )}
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

export function DayEditSheet({ day, onClose }: { day: TripDay | null; onClose: () => void }) {
  if (!day) return null
  return <DayEditForm day={day} onClose={onClose} />
}

function DayEditForm({ day, onClose }: { day: TripDay; onClose: () => void }) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const formId = useId()
  const [title, setTitle] = useState(day.title ?? '')
  const [notes, setNotes] = useState(day.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateTripDay(day.id, { title, notes })
      onClose()
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${t('itinerary.dayN', { n: day.dayOrder })} · ${formatDate(day.date, locale, 'dayMonth')}`}
      footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <FormError message={error} />
        <Field label={t('itinerary.dayTitle')} htmlFor={`${formId}-title`} optional={t('common.optional')}>
          <TextInput id={`${formId}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('itinerary.dayTitlePlaceholder')} />
        </Field>
        <Field label={t('common.notes')} htmlFor={`${formId}-notes`} optional={t('common.optional')}>
          <TextArea id={`${formId}-notes`} rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

export function MoveActivitySheet({ activity, days, onClose }: { activity: Activity | null; days: TripDay[]; onClose: () => void }) {
  const i18n = useI18n()
  const { t, locale } = i18n
  if (!activity) return null
  const move = async (day: TripDay) => {
    try {
      await moveActivity(activity.id, day.id)
      onClose()
      showToast(t('activity.moved', { day: formatDate(day.date, locale, 'weekday') }), { tone: 'success' })
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }
  return (
    <Sheet open onClose={onClose} title={t('activity.moveTitle')} size="auto">
      <p className="mb-3 text-[15px] font-semibold">{activity.title}</p>
      <div className="flex flex-col gap-2">
        {days.map((d) => {
          const current = d.id === activity.tripDayId
          return (
            <button
              key={d.id}
              type="button"
              disabled={current}
              onClick={() => void move(d)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-xl border px-3.5 text-left',
                current ? 'border-primary bg-primary-soft' : 'border-line active:bg-surface-2',
              )}
            >
              <span className="font-medium">{t('itinerary.dayN', { n: d.dayOrder })}</span>
              <span className="text-muted">{formatDate(d.date, locale, 'weekday')}</span>
              {current && <span className="ml-auto text-sm text-primary">{t('activity.currentDay')}</span>}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
