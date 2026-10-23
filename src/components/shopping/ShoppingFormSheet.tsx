import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { PRIORITY_LABEL } from '@/i18n/labels'
import { PRODUCT_IMAGE } from '@/services/imageService'
import { createShoppingItem, updateShoppingItem, type ShoppingInput } from '@/services/shoppingService'
import { showToast } from '@/stores/uiStore'
import { PRIORITIES, type Place, type Priority, type ShoppingItem } from '@/types/entities'
import { amountToInput, parseAmountInput } from '@/utils/money'
import { PlacePicker, placeChoiceArgs, placeChoiceFrom, type PlaceChoice } from '../places/PlacePicker'
import { CurrencyOptions } from '../trip/TripFormSheet'
import { Field, FieldRow, FormError, Select, SwitchRow, TextArea, TextInput } from '../ui/Field'
import { ImagePicker, imageValueFrom, toImageChange, type ImageValue } from '../ui/Images'
import { SegmentedControl, Stepper } from '../ui/Primitives'
import { Sheet, SheetSubmit } from '../ui/Sheet'

interface ShoppingFormSheetProps {
  open: boolean
  onClose: () => void
  tripId: string
  baseCurrency: string
  places: Place[]
  recipients: string[]
  item?: ShoppingItem | null
}

export function ShoppingFormSheet(props: ShoppingFormSheetProps) {
  if (!props.open) return null
  return <ShoppingForm {...props} />
}

function ShoppingForm({ onClose, tripId, baseCurrency, places, recipients, item }: ShoppingFormSheetProps) {
  const i18n = useI18n()
  const { t } = i18n
  const formId = useId()
  const [image, setImage] = useState<ImageValue>(imageValueFrom(item?.imageId))
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? 1)
  const [purchased, setPurchased] = useState(item?.purchasedQuantity ?? 0)
  const [currency, setCurrency] = useState(item?.currency ?? baseCurrency)
  const [estimated, setEstimated] = useState(amountToInput(item?.estimatedUnitPrice, item?.currency ?? baseCurrency))
  const [actual, setActual] = useState(amountToInput(item?.actualUnitPrice, item?.currency ?? baseCurrency))
  const [shop, setShop] = useState<PlaceChoice>(placeChoiceFrom(item?.shopPlaceId))
  const [recipient, setRecipient] = useState(item?.recipient ?? '')
  const [priority, setPriority] = useState<Priority>(item?.priority ?? 'medium')
  const [cancelled, setCancelled] = useState(item?.status === 'cancelled')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const changeQuantity = (q: number) => {
    setQuantity(q)
    if (purchased > q) setPurchased(q)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issues: Record<string, string> = {}
    const est = parseAmountInput(estimated)
    const act = parseAmountInput(actual)
    if (est !== null && !Number.isFinite(est)) issues.estimatedUnitPrice = t('v.number')
    if (act !== null && !Number.isFinite(act)) issues.actualUnitPrice = t('v.number')
    setErrors(issues)
    setFormError(null)
    if (Object.keys(issues).length) return
    const { placeId, newPlace } = placeChoiceArgs(shop)
    const input: ShoppingInput = {
      name,
      description,
      quantity,
      purchasedQuantity: purchased,
      estimatedUnitPrice: est,
      actualUnitPrice: act,
      currency,
      shopPlaceId: placeId,
      recipient,
      priority,
      cancelled,
      notes,
    }
    setSaving(true)
    try {
      const change = toImageChange(item?.imageId, image)
      if (item) await updateShoppingItem(item.id, input, change, { newShop: newPlace })
      else await createShoppingItem(tripId, input, change, { newShop: newPlace })
      showToast(t(item ? 'common.saved' : 'shopping.created'), { tone: 'success' })
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
    <Sheet open onClose={onClose} title={item ? t('shopping.editTitle') : t('shopping.newTitle')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('shopping.image')} optional={t('common.optional')} hint={t('shopping.imageHint')}>
          <div className="flex justify-center">
            <ImagePicker value={image} onChange={setImage} options={PRODUCT_IMAGE} />
          </div>
        </Field>
        <Field label={t('shopping.name')} htmlFor={id('name')} error={errors.name}>
          <TextInput id={id('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('shopping.namePlaceholder')} invalid={!!errors.name} />
        </Field>
        <FieldRow>
          <Field label={t('shopping.quantity')} error={errors.quantity}>
            <Stepper value={quantity} onChange={changeQuantity} min={1} label={t('shopping.quantity')} />
          </Field>
          <Field label={t('shopping.purchasedQty')} error={errors.purchasedQuantity}>
            <Stepper value={purchased} onChange={setPurchased} min={0} max={quantity} label={t('shopping.purchasedQty')} />
          </Field>
        </FieldRow>
        <Field label={t('shopping.currency')} htmlFor={id('cur')}>
          <Select id={id('cur')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <CurrencyOptions />
          </Select>
        </Field>
        <FieldRow>
          <Field label={t('shopping.estimatedUnitPrice')} htmlFor={id('est')} optional={t('common.optional')} error={errors.estimatedUnitPrice}>
            <TextInput id={id('est')} inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="0" invalid={!!errors.estimatedUnitPrice} />
          </Field>
          <Field label={t('shopping.actualUnitPriceShort')} htmlFor={id('act')} optional={t('common.optional')} error={errors.actualUnitPrice}>
            <TextInput id={id('act')} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" invalid={!!errors.actualUnitPrice} />
          </Field>
        </FieldRow>
        <PlacePicker label={t('shopping.store')} places={places} value={shop} onChange={setShop} newCategoryId="shopping" preferCategory="shopping" urlError={errors.googleMapsUrl} />
        <Field label={t('shopping.recipient')} htmlFor={id('recipient')} optional={t('common.optional')}>
          <TextInput id={id('recipient')} list={id('recipients')} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={t('shopping.recipientPlaceholder')} autoComplete="off" />
          <datalist id={id('recipients')}>
            {recipients.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label={t('shopping.priority')}>
          <SegmentedControl label={t('shopping.priority')} value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) }))} />
        </Field>
        <Field label={t('shopping.description')} htmlFor={id('desc')} optional={t('common.optional')}>
          <TextArea id={id('desc')} rows={2} className="min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('shopping.descriptionPlaceholder')} />
        </Field>
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {item && <SwitchRow label={t('shopping.cancelled')} description={t('shopping.cancelledHint')} checked={cancelled} onChange={setCancelled} />}
      </form>
    </Sheet>
  )
}
