import { useId, useState, type FormEvent } from 'react'
import { ClipboardPaste, LocateFixed } from 'lucide-react'
import { useCategories } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { categoryLabel } from '@/i18n/labels'
import { createPlace, findDuplicatePlaces, updatePlace, type PlaceInput } from '@/services/placeService'
import { askDialog, showToast } from '@/stores/uiStore'
import type { Place } from '@/types/entities'
import { extractCoordinates, isShortMapsLink, isValidCoordinates, normalizeMapsUrl } from '@/utils/maps'
import { Field, FormError, Select, SwitchRow, TextArea, TextInput } from '../ui/Field'
import { Sheet, SheetSubmit } from '../ui/Sheet'

export function parseCoordinates(text: string): { latitude: number; longitude: number } | null | 'invalid' {
  if (!text.trim()) return null
  const parts = text.split(/[,\s]+/).filter(Boolean).map(Number)
  if (parts.length !== 2 || !isValidCoordinates(parts[0], parts[1])) return 'invalid'
  return { latitude: parts[0], longitude: parts[1] }
}

const canReadClipboardText = () => typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

/** Google Maps link input with paste, short-link notice and coordinate detection. */
export function MapsUrlField({
  id,
  value,
  onChange,
  error,
  onUseCoordinates,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
  onUseCoordinates?: (coords: string) => void
}) {
  const { t } = useI18n()
  const normalized = value.trim() ? normalizeMapsUrl(value) : null
  const coords = normalized ? extractCoordinates(normalized) : null
  let hint: string | undefined
  if (value.trim() && !normalized) hint = t('place.urlInvalidHint')
  else if (normalized && isShortMapsLink(normalized)) hint = t('place.shortLinkHint')
  else if (coords) hint = t('place.coordsFound', { coords: `${coords.latitude}, ${coords.longitude}` })

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) onChange(text.trim())
    } catch {
      showToast(t('error.clipboardDenied'), { tone: 'error' })
    }
  }

  return (
    <Field label={t('place.mapsUrl')} htmlFor={id} error={error} hint={hint} optional={t('common.optional')}>
      <div className="flex gap-2">
        <TextInput
          id={id}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://maps.app.goo.gl/…"
          invalid={!!error}
        />
        {canReadClipboardText() && (
          <button
            type="button"
            onClick={paste}
            aria-label={t('image.paste')}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary active:bg-line"
          >
            <ClipboardPaste className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {coords && onUseCoordinates && (
        <button
          type="button"
          onClick={() => onUseCoordinates(`${coords.latitude}, ${coords.longitude}`)}
          className="flex h-9 items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-primary active:bg-primary-soft"
        >
          <LocateFixed className="size-4" aria-hidden />
          {t('place.useCoords')}
        </button>
      )}
    </Field>
  )
}

export function CategorySelect({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const i18n = useI18n()
  const categories = useCategories() ?? []
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {categoryLabel(c, i18n)}
        </option>
      ))}
      {categories.length === 0 && <option value={value}>{value}</option>}
    </Select>
  )
}

interface PlaceFormSheetProps {
  open: boolean
  onClose: () => void
  tripId: string
  place?: Place | null
  defaultCategoryId?: string
  onSaved?: (place: Place) => void
}

export function PlaceFormSheet(props: PlaceFormSheetProps) {
  if (!props.open) return null
  return <PlaceForm {...props} />
}

function PlaceForm({ onClose, tripId, place, defaultCategoryId = 'attraction', onSaved }: PlaceFormSheetProps) {
  const i18n = useI18n()
  const { t } = i18n
  const formId = useId()
  const [name, setName] = useState(place?.name ?? '')
  const [categoryId, setCategoryId] = useState(place?.categoryId ?? place?.category ?? defaultCategoryId)
  const [url, setUrl] = useState(place?.googleMapsUrl ?? '')
  const [address, setAddress] = useState(place?.address ?? '')
  const [coords, setCoords] = useState(
    typeof place?.latitude === 'number' && typeof place.longitude === 'number' ? `${place.latitude}, ${place.longitude}` : '',
  )
  const [hours, setHours] = useState(place?.openingHoursNote ?? '')
  const [minutes, setMinutes] = useState(place?.estimatedVisitMinutes?.toString() ?? '')
  const [notes, setNotes] = useState(place?.notes ?? '')
  const [visited, setVisited] = useState(place?.isVisited ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issues: Record<string, string> = {}
    const parsed = parseCoordinates(coords)
    if (parsed === 'invalid') issues.coordinates = t('v.coords')
    const visit = minutes.trim() ? Number(minutes) : undefined
    if (visit !== undefined && (!Number.isInteger(visit) || visit < 0)) issues.estimatedVisitMinutes = t('v.integer')
    setErrors(issues)
    setFormError(null)
    if (Object.keys(issues).length) return
    const input: PlaceInput = {
      name,
      categoryId,
      address,
      latitude: parsed && parsed !== 'invalid' ? parsed.latitude : null,
      longitude: parsed && parsed !== 'invalid' ? parsed.longitude : null,
      googleMapsUrl: url,
      googlePlaceId: place?.googleMapsUrl === normalizeMapsUrl(url) ? place?.googlePlaceId : undefined,
      openingHoursNote: hours,
      estimatedVisitMinutes: visit,
      notes,
      isVisited: visited,
    }
    setSaving(true)
    try {
      if (!place && name.trim()) {
        const duplicates = await findDuplicatePlaces(tripId, input)
        if (duplicates.length) {
          const choice = await askDialog({
            title: t('place.duplicateTitle'),
            message: t('place.duplicateMessage'),
            details: duplicates.map((p) => p.name),
            cancelLabel: t('common.cancel'),
            actions: [{ id: 'save', label: t('place.saveAnyway'), tone: 'primary' }],
          })
          if (!choice) return
        }
      }
      const saved = place ? await updatePlace(place.id, input) : await createPlace(tripId, input)
      showToast(t(place ? 'common.saved' : 'place.created'), { tone: 'success' })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      const fields = fieldErrors(err, i18n)
      if (fields) setErrors({ ...fields, coordinates: fields.latitude ?? fields.longitude ?? '' })
      else setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  const id = (f: string) => `${formId}-${f}`
  return (
    <Sheet open onClose={onClose} title={place ? t('place.editTitle') : t('place.newTitle')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('place.name')} htmlFor={id('name')} error={errors.name}>
          <TextInput id={id('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('place.namePlaceholder')} invalid={!!errors.name} />
        </Field>
        <Field label={t('place.category')} htmlFor={id('cat')}>
          <CategorySelect id={id('cat')} value={categoryId} onChange={setCategoryId} />
        </Field>
        <MapsUrlField id={id('url')} value={url} onChange={setUrl} error={errors.googleMapsUrl} onUseCoordinates={setCoords} />
        <Field label={t('place.address')} htmlFor={id('address')} optional={t('common.optional')} error={errors.address}>
          <TextArea id={id('address')} rows={2} className="min-h-16" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label={t('place.coordinates')} htmlFor={id('coords')} optional={t('common.optional')} hint={t('place.coordinatesHint')} error={errors.coordinates}>
          <TextInput id={id('coords')} inputMode="decimal" value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="35.7148, 139.7967" invalid={!!errors.coordinates} />
        </Field>
        <Field label={t('place.openingHours')} htmlFor={id('hours')} optional={t('common.optional')}>
          <TextInput id={id('hours')} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={t('place.openingHoursPlaceholder')} />
        </Field>
        <Field label={t('place.visitMinutes')} htmlFor={id('mins')} optional={t('common.optional')} error={errors.estimatedVisitMinutes}>
          <TextInput id={id('mins')} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="60" />
        </Field>
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <SwitchRow label={t('place.visited')} checked={visited} onChange={setVisited} />
      </form>
    </Sheet>
  )
}
