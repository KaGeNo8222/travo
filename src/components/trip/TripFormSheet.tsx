import { useId, useMemo, useState, type FormEvent } from 'react'
import { useAppSettings } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { formatDate } from '@/i18n/format'
import { TRIP_STATUS_LABEL } from '@/i18n/labels'
import { COVER_IMAGE } from '@/services/imageService'
import { createTrip, updateTrip, type DateStrategy, type TripInput } from '@/services/tripService'
import { askDialog, showToast } from '@/stores/uiStore'
import { TRIP_STATUSES, type Trip, type TripStatus } from '@/types/entities'
import { COUNTRY_PRESETS, findCountryPreset } from '@/utils/countries'
import { SUPPORTED_CURRENCIES, currencyName } from '@/utils/currency'
import { DateChangeConflictError } from '@/utils/errors'
import { addDaysToDate, deviceTimeZone, gmtOffsetLabel, listTimeZones, todayInTimeZone } from '@/utils/time'
import { Field, FieldRow, FormError, Select, TextArea, TextInput } from '../ui/Field'
import { ImagePicker, imageValueFrom, toImageChange, type ImageValue } from '../ui/Images'
import { Sheet, SheetSubmit } from '../ui/Sheet'

interface TripFormSheetProps {
  open: boolean
  onClose: () => void
  /** Trip to edit; omit to create a new one. */
  trip?: Trip | null
  onSaved?: (trip: Trip) => void
}

export function TripFormSheet(props: TripFormSheetProps) {
  if (!props.open) return null
  return <TripForm {...props} />
}

export function useTimeZoneOptions(): Array<{ value: string; label: string }> {
  return useMemo(() => {
    const now = new Date()
    return listTimeZones().map((tz) => ({ value: tz, label: `${tz.replace(/_/g, ' ')} (${gmtOffsetLabel(tz, now)})` }))
  }, [])
}

export function CurrencyOptions() {
  const { locale } = useI18n()
  return (
    <>
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c} — {currencyName(c, locale)}
        </option>
      ))}
    </>
  )
}

function TripForm({ onClose, trip, onSaved }: TripFormSheetProps) {
  const i18n = useI18n()
  const { t, lang, locale } = i18n
  const formId = useId()
  const appSettings = useAppSettings()
  const timeZones = useTimeZoneOptions()
  const defaultStart = addDaysToDate(todayInTimeZone(deviceTimeZone()), 7)

  const [name, setName] = useState(trip?.name ?? '')
  const [country, setCountry] = useState(trip?.destinationCountry ?? '')
  const [cities, setCities] = useState(trip?.destinationCities.join(', ') ?? '')
  const [startDate, setStartDate] = useState(trip?.startDate ?? defaultStart)
  const [endDate, setEndDate] = useState(trip?.endDate ?? addDaysToDate(defaultStart, 4))
  const [timezone, setTimezone] = useState(trip?.timezone ?? deviceTimeZone())
  const [currency, setCurrency] = useState<string | null>(null)
  const [status, setStatus] = useState<TripStatus>(trip?.status ?? 'planning')
  const [notes, setNotes] = useState(trip?.notes ?? '')
  const [cover, setCover] = useState<ImageValue>(imageValueFrom(trip?.coverImageId))
  const [tzTouched, setTzTouched] = useState(!!trip)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const baseCurrency = currency ?? appSettings?.defaultCurrency ?? 'JPY'

  const onCountryChange = (value: string) => {
    setCountry(value)
    const preset = findCountryPreset(value)
    if (!preset) return
    if (!tzTouched) setTimezone(preset.timezone)
    if (!trip && currency === null) setCurrency(preset.currency)
  }

  const onStartChange = (value: string) => {
    setStartDate(value)
    if (value && endDate && endDate < value) setEndDate(value)
  }

  /** Saves an edit; asks how to handle days that would disappear. Null when cancelled. */
  const saveEdit = async (existing: Trip, input: TripInput): Promise<Trip | null> => {
    const coverChange = toImageChange(existing.coverImageId, cover)
    try {
      return await updateTrip(existing.id, input, { cover: coverChange })
    } catch (err) {
      if (!(err instanceof DateChangeConflictError)) throw err
      const choice = await askDialog({
        title: t('trip.dateConflictTitle'),
        message: t('trip.dateConflictMessage'),
        details: err.conflicts.map((c) =>
          t(c.activityCount ? 'trip.conflictDay' : 'trip.conflictDayNotes', {
            date: formatDate(c.date, locale, 'weekday'),
            count: c.activityCount,
          }),
        ),
        cancelLabel: t('common.cancel'),
        actions: [
          { id: 'shift', label: t('trip.strategyShift'), tone: 'primary' },
          { id: 'keep-dates', label: t('trip.strategyKeep'), tone: 'primary' },
        ],
      })
      if (!choice) return null
      return updateTrip(existing.id, input, { cover: coverChange, dateStrategy: choice as DateStrategy })
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)
    const input: TripInput = {
      name,
      destinationCountry: country,
      destinationCities: cities
        .split(/[,،、\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      startDate,
      endDate,
      timezone,
      status,
      notes,
    }
    try {
      const saved = trip
        ? await saveEdit(trip, input)
        : await createTrip(input, { baseCurrency, cover: toImageChange(null, cover) })
      if (!saved) return
      showToast(t(trip ? 'trip.updated' : 'trip.created'), { tone: 'success' })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      const fields = fieldErrors(err, i18n)
      if (fields) setErrors(fields)
      else setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  const id = (field: string) => `${formId}-${field}`

  return (
    <Sheet
      open
      onClose={onClose}
      title={trip ? t('trip.editTitle') : t('trip.newTitle')}
      footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('trip.name')} htmlFor={id('name')} error={errors.name}>
          <TextInput id={id('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('trip.namePlaceholder')} invalid={!!errors.name} enterKeyHint="next" />
        </Field>
        <Field label={t('trip.country')} htmlFor={id('country')} error={errors.destinationCountry}>
          <TextInput
            id={id('country')}
            list={id('countries')}
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            placeholder={t('trip.countryPlaceholder')}
            invalid={!!errors.destinationCountry}
            autoComplete="off"
          />
          <datalist id={id('countries')}>
            {COUNTRY_PRESETS.map((c) => (
              <option key={c.code} value={lang === 'th' ? c.th : c.en} />
            ))}
          </datalist>
        </Field>
        <Field label={t('trip.cities')} htmlFor={id('cities')} hint={t('trip.citiesHint')} optional={t('common.optional')}>
          <TextInput id={id('cities')} value={cities} onChange={(e) => setCities(e.target.value)} placeholder={t('trip.citiesPlaceholder')} />
        </Field>
        <FieldRow>
          <Field label={t('trip.startDate')} htmlFor={id('start')} error={errors.startDate}>
            <TextInput id={id('start')} type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} invalid={!!errors.startDate} />
          </Field>
          <Field label={t('trip.endDate')} htmlFor={id('end')} error={errors.endDate}>
            <TextInput id={id('end')} type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} invalid={!!errors.endDate} />
          </Field>
        </FieldRow>
        <Field label={t('trip.timezone')} htmlFor={id('tz')} hint={t('trip.timezoneHint')} error={errors.timezone}>
          <Select
            id={id('tz')}
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value)
              setTzTouched(true)
            }}
          >
            {timeZones.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </Field>
        {!trip && (
          <Field label={t('trip.baseCurrency')} htmlFor={id('currency')} hint={t('trip.baseCurrencyHint')}>
            <Select id={id('currency')} value={baseCurrency} onChange={(e) => setCurrency(e.target.value)}>
              <CurrencyOptions />
            </Select>
          </Field>
        )}
        <Field label={t('trip.status')} htmlFor={id('status')} hint={t('trip.statusHint')}>
          <Select id={id('status')} value={status} onChange={(e) => setStatus(e.target.value as TripStatus)}>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(TRIP_STATUS_LABEL[s])}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('trip.cover')} optional={t('common.optional')}>
          <ImagePicker value={cover} onChange={setCover} options={COVER_IMAGE} aspect="wide" />
        </Field>
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')} error={errors.notes}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
