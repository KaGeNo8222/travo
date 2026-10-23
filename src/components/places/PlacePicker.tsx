import { useId } from 'react'
import { useI18n } from '@/i18n'
import type { PlaceInput } from '@/services/placeService'
import type { Place } from '@/types/entities'
import { Field, Select, TextInput } from '../ui/Field'
import { CategorySelect, MapsUrlField } from './PlaceFormSheet'

const NEW = '__new__'

export type PlaceChoice =
  | { mode: 'none' }
  | { mode: 'existing'; placeId: string }
  | { mode: 'new'; name: string; categoryId: string; googleMapsUrl: string }

export function placeChoiceFrom(placeId: string | null | undefined): PlaceChoice {
  return placeId ? { mode: 'existing', placeId } : { mode: 'none' }
}

/** Splits a choice into the service arguments: an existing id or a place to create. */
export function placeChoiceArgs(choice: PlaceChoice): { placeId: string | null; newPlace?: PlaceInput } {
  if (choice.mode === 'existing') return { placeId: choice.placeId }
  if (choice.mode === 'new' && choice.name.trim()) {
    return {
      placeId: null,
      newPlace: { name: choice.name, categoryId: choice.categoryId, googleMapsUrl: choice.googleMapsUrl, isVisited: false },
    }
  }
  return { placeId: null }
}

interface PlacePickerProps {
  label: string
  places: Place[]
  value: PlaceChoice
  onChange: (value: PlaceChoice) => void
  /** Category for places created here (e.g. "shopping" for a store). */
  newCategoryId?: string
  /** Show places of this category first. */
  preferCategory?: string
  error?: string
  urlError?: string
}

/** Choose a saved place of the trip, or create one inline with a name and Maps link. */
export function PlacePicker({ label, places, value, onChange, newCategoryId = 'attraction', preferCategory, error, urlError }: PlacePickerProps) {
  const { t } = useI18n()
  const id = useId()
  const sorted = preferCategory
    ? [...places].sort((a, b) => Number(b.category === preferCategory) - Number(a.category === preferCategory))
    : places
  const selectValue = value.mode === 'existing' ? value.placeId : value.mode === 'new' ? NEW : ''

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} htmlFor={id} optional={t('common.optional')} error={error}>
        <Select
          id={id}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === NEW) onChange({ mode: 'new', name: '', categoryId: newCategoryId, googleMapsUrl: '' })
            else if (v) onChange({ mode: 'existing', placeId: v })
            else onChange({ mode: 'none' })
          }}
        >
          <option value="">{t('place.none')}</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>{t('place.createInline')}</option>
        </Select>
      </Field>
      {value.mode === 'new' && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line p-3.5">
          <Field label={t('place.name')} htmlFor={`${id}-name`}>
            <TextInput id={`${id}-name`} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={t('place.namePlaceholder')} />
          </Field>
          <Field label={t('place.category')} htmlFor={`${id}-cat`}>
            <CategorySelect id={`${id}-cat`} value={value.categoryId} onChange={(categoryId) => onChange({ ...value, categoryId })} />
          </Field>
          <MapsUrlField id={`${id}-url`} value={value.googleMapsUrl} onChange={(googleMapsUrl) => onChange({ ...value, googleMapsUrl })} error={urlError} />
        </div>
      )}
    </div>
  )
}
