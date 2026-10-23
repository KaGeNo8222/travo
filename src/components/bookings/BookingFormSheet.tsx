import { useId, useRef, useState, type FormEvent } from 'react'
import { Paperclip } from 'lucide-react'
import { useOwnerAttachments } from '@/hooks/useData'
import { useConfirm } from '@/hooks/useConfirm'
import { useI18n, type TKey } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { BOOKING_TYPE_LABEL } from '@/i18n/labels'
import { deleteAttachment } from '@/services/attachmentService'
import { createBooking, updateBooking, type BookingInput } from '@/services/bookingService'
import { prepareDocument, type ProcessedFile } from '@/services/imageService'
import { showToast } from '@/stores/uiStore'
import { BOOKING_TYPES, type Booking, type BookingType, type Place, type Trip } from '@/types/entities'
import { cn } from '@/utils/cn'
import { PlacePicker, placeChoiceArgs, placeChoiceFrom, type PlaceChoice } from '../places/PlacePicker'
import { useTimeZoneOptions } from '../trip/TripFormSheet'
import { Field, FieldRow, FormError, Select, TextArea, TextInput } from '../ui/Field'
import { Sheet, SheetSubmit } from '../ui/Sheet'
import { AttachmentChip, BOOKING_ICONS } from './BookingCards'

interface BookingFormSheetProps {
  open: boolean
  onClose: () => void
  trip: Trip
  places: Place[]
  booking?: Booking | null
  defaultType?: BookingType
}

export function BookingFormSheet(props: BookingFormSheetProps) {
  if (!props.open) return null
  return <BookingForm {...props} />
}

function TimeZoneSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const zones = useTimeZoneOptions()
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z.value} value={z.value}>
          {z.label}
        </option>
      ))}
    </Select>
  )
}

const LABELS: Record<BookingType, { title: TKey; provider: TKey; start: TKey; end: TKey }> = {
  flight: { title: 'booking.flightTitle', provider: 'booking.airline', start: 'booking.departure', end: 'booking.arrival' },
  hotel: { title: 'booking.hotelName', provider: 'booking.bookedVia', start: 'booking.checkIn', end: 'booking.checkOut' },
  train: { title: 'booking.title', provider: 'booking.operator', start: 'booking.departure', end: 'booking.arrival' },
  transport: { title: 'booking.title', provider: 'booking.operator', start: 'booking.departure', end: 'booking.arrival' },
  attraction: { title: 'booking.title', provider: 'booking.provider', start: 'booking.start', end: 'booking.end' },
  other: { title: 'booking.title', provider: 'booking.provider', start: 'booking.start', end: 'booking.end' },
}

function BookingForm({ onClose, trip, places, booking, defaultType = 'flight' }: BookingFormSheetProps) {
  const i18n = useI18n()
  const { t } = i18n
  const formId = useId()
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const existingFiles = useOwnerAttachments('booking', booking?.id) ?? []
  const [type, setType] = useState<BookingType>(booking?.type ?? defaultType)
  const [title, setTitle] = useState(booking?.title ?? '')
  const [provider, setProvider] = useState(booking?.provider ?? '')
  const [reference, setReference] = useState(booking?.bookingReference ?? '')
  const [flightNumber, setFlightNumber] = useState(booking?.flightNumber ?? '')
  const [origin, setOrigin] = useState(booking?.origin ?? '')
  const [destination, setDestination] = useState(booking?.destination ?? '')
  const [start, setStart] = useState(booking?.startLocalDateTime ?? (defaultType === 'hotel' ? `${trip.startDate}T15:00` : ''))
  const [end, setEnd] = useState(booking?.endLocalDateTime ?? (defaultType === 'hotel' ? `${trip.endDate}T11:00` : ''))
  const [startTz, setStartTz] = useState(booking?.startTimezone ?? trip.timezone)
  const [endTz, setEndTz] = useState(booking?.endTimezone ?? booking?.startTimezone ?? trip.timezone)
  const [terminal, setTerminal] = useState(booking?.terminal ?? '')
  const [address, setAddress] = useState(booking?.address ?? '')
  const [placeChoice, setPlaceChoice] = useState<PlaceChoice>(placeChoiceFrom(booking?.placeId))
  const [notes, setNotes] = useState(booking?.notes ?? '')
  const [files, setFiles] = useState<ProcessedFile[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isFlight = type === 'flight'
  const hasRoute = type === 'flight' || type === 'train' || type === 'transport'
  const hasPlace = type === 'hotel' || type === 'attraction' || type === 'other'
  const labels = LABELS[type]

  const changeType = (next: BookingType) => {
    setType(next)
    if (next === 'hotel' && !booking) {
      if (!start) setStart(`${trip.startDate}T15:00`)
      if (!end) setEnd(`${trip.endDate}T11:00`)
    }
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next: ProcessedFile[] = []
    for (const file of list) {
      try {
        next.push(prepareDocument(file))
      } catch (err) {
        showToast(`${file.name}: ${errorMessage(err, i18n)}`, { tone: 'error' })
      }
    }
    setFiles((f) => [...f, ...next])
  }

  const removeExisting = async (id: string, name: string) => {
    if (await confirm({ title: t('booking.deleteFileTitle'), message: name, confirmLabel: t('common.delete'), danger: true })) {
      await deleteAttachment(id)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const autoTitle = isFlight ? [origin && destination ? `${origin} → ${destination}` : '', flightNumber].find(Boolean) : ''
    const { placeId, newPlace } = hasPlace ? placeChoiceArgs(placeChoice) : { placeId: null, newPlace: undefined }
    const input: BookingInput = {
      type,
      title: title.trim() || autoTitle || '',
      provider,
      bookingReference: reference,
      startLocalDateTime: start,
      endLocalDateTime: end,
      startTimezone: startTz,
      endTimezone: isFlight ? endTz : startTz,
      origin: hasRoute ? origin : '',
      destination: hasRoute ? destination : '',
      flightNumber: isFlight ? flightNumber : '',
      terminal: isFlight ? terminal : '',
      address: hasPlace ? address : '',
      placeId,
      notes,
    }
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      if (booking) await updateBooking(booking.id, input, { newPlace, files })
      else await createBooking(trip.id, input, { newPlace, files })
      showToast(t(booking ? 'common.saved' : 'booking.created'), { tone: 'success' })
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
  return (
    <Sheet open onClose={onClose} title={booking ? t('booking.editTitle') : t('booking.newTitle')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <div role="radiogroup" aria-label={t('booking.type')} className="grid grid-cols-3 gap-2">
          {BOOKING_TYPES.map((bt) => {
            const Icon = BOOKING_ICONS[bt]
            return (
              <button
                key={bt}
                type="button"
                role="radio"
                aria-checked={type === bt}
                onClick={() => changeType(bt)}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[13px] font-medium',
                  type === bt ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted active:bg-surface-2',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(BOOKING_TYPE_LABEL[bt])}
              </button>
            )
          })}
        </div>

        <Field label={t(labels.title)} htmlFor={id('title')} error={errors.title} hint={isFlight ? t('booking.flightTitleHint') : undefined} optional={isFlight ? t('common.optional') : undefined}>
          <TextInput id={id('title')} value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} />
        </Field>
        <FieldRow>
          <Field label={t(labels.provider)} htmlFor={id('provider')} optional={t('common.optional')}>
            <TextInput id={id('provider')} value={provider} onChange={(e) => setProvider(e.target.value)} />
          </Field>
          {isFlight ? (
            <Field label={t('booking.flightNumber')} htmlFor={id('flight')} optional={t('common.optional')} error={errors.flightNumber}>
              <TextInput id={id('flight')} value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} autoCapitalize="characters" placeholder="TG 682" />
            </Field>
          ) : (
            <Field label={t('booking.reference')} htmlFor={id('ref')} optional={t('common.optional')}>
              <TextInput id={id('ref')} value={reference} onChange={(e) => setReference(e.target.value)} autoCapitalize="characters" autoComplete="off" />
            </Field>
          )}
        </FieldRow>
        {hasRoute && (
          <FieldRow>
            <Field label={isFlight ? t('booking.fromAirport') : t('booking.from')} htmlFor={id('origin')} optional={t('common.optional')}>
              <TextInput id={id('origin')} value={origin} onChange={(e) => setOrigin(isFlight ? e.target.value.toUpperCase() : e.target.value)} placeholder={isFlight ? 'BKK' : undefined} />
            </Field>
            <Field label={isFlight ? t('booking.toAirport') : t('booking.to')} htmlFor={id('dest')} optional={t('common.optional')}>
              <TextInput id={id('dest')} value={destination} onChange={(e) => setDestination(isFlight ? e.target.value.toUpperCase() : e.target.value)} placeholder={isFlight ? 'HND' : undefined} />
            </Field>
          </FieldRow>
        )}
        <Field label={t(labels.start)} htmlFor={id('start')} optional={t('common.optional')} error={errors.startLocalDateTime}>
          <TextInput id={id('start')} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={isFlight ? t('booking.departureTz') : t('booking.timezone')} htmlFor={id('stz')} hint={isFlight ? undefined : t('booking.timezoneHint')}>
          <TimeZoneSelect id={id('stz')} value={startTz} onChange={setStartTz} />
        </Field>
        <Field label={t(labels.end)} htmlFor={id('end')} optional={t('common.optional')} error={errors.endLocalDateTime}>
          <TextInput id={id('end')} type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} invalid={!!errors.endLocalDateTime} />
        </Field>
        {isFlight && (
          <>
            <Field label={t('booking.arrivalTz')} htmlFor={id('etz')} hint={t('booking.arrivalTzHint')}>
              <TimeZoneSelect id={id('etz')} value={endTz} onChange={setEndTz} />
            </Field>
            <FieldRow>
              <Field label={t('booking.terminal')} htmlFor={id('terminal')} optional={t('common.optional')}>
                <TextInput id={id('terminal')} value={terminal} onChange={(e) => setTerminal(e.target.value)} />
              </Field>
              <Field label={t('booking.reference')} htmlFor={id('ref2')} optional={t('common.optional')}>
                <TextInput id={id('ref2')} value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
              </Field>
            </FieldRow>
          </>
        )}
        {hasPlace && (
          <>
            <Field label={t('place.address')} htmlFor={id('address')} optional={t('common.optional')}>
              <TextArea id={id('address')} rows={2} className="min-h-16" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <PlacePicker
              label={t('booking.mapPlace')}
              places={places}
              value={placeChoice}
              onChange={setPlaceChoice}
              newCategoryId={type === 'hotel' ? 'hotel' : 'attraction'}
              preferCategory={type === 'hotel' ? 'hotel' : undefined}
              urlError={errors.googleMapsUrl}
            />
          </>
        )}
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Field label={t('booking.files')} hint={t('booking.filesHint')}>
          <div className="flex flex-col gap-2">
            {existingFiles.map((a) => (
              <AttachmentChip key={a.id} name={a.filename} size={a.size} onRemove={() => void removeExisting(a.id, a.filename)} />
            ))}
            {files.map((f, i) => (
              <AttachmentChip key={`${f.filename}-${i}`} name={f.filename} size={f.size} onRemove={() => setFiles((list) => list.filter((_, j) => j !== i))} />
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-primary active:bg-surface-2">
              <Paperclip className="size-4" aria-hidden />
              {t('booking.addFiles')}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </Field>
      </form>
    </Sheet>
  )
}
