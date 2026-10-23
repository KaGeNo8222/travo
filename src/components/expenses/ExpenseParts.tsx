import { useId, useState, type FormEvent } from 'react'
import { BedDouble, Receipt, ShoppingBag, Ticket, TrainFront, Utensils, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { formatDate, formatMoney, formatRate } from '@/i18n/format'
import { EXPENSE_CATEGORY_LABEL } from '@/i18n/labels'
import { createExpense, updateExpense, type ExpenseInput } from '@/services/expenseService'
import { showToast } from '@/stores/uiStore'
import { EXPENSE_CATEGORIES, type Activity, type Expense, type ShoppingItem, type Trip, type TripDay, type TripSettings } from '@/types/entities'
import { amountToInput, parseAmountInput } from '@/utils/money'
import { computeAmountTHB, rateToTHB } from '@/utils/spending'
import { todayInTimeZone } from '@/utils/time'
import { CurrencyOptions } from '../trip/TripFormSheet'
import { Field, FieldRow, FormError, Select, TextArea, TextInput } from '../ui/Field'
import { Sheet, SheetSubmit } from '../ui/Sheet'

export const EXPENSE_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  transport: TrainFront,
  accommodation: BedDouble,
  shopping: ShoppingBag,
  activity: Ticket,
  other: Receipt,
}

/** Simple horizontal bars; values share one scale. */
export function SpendingBars({ rows, currency }: { rows: Array<{ key: string; label: string; total: number }>; currency: string }) {
  const { locale } = useI18n()
  const max = Math.max(...rows.map((r) => r.total), 0)
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMoney(r.total, currency, locale)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? Math.max(2, (r.total / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

interface ExpenseFormSheetProps {
  open: boolean
  onClose: () => void
  trip: Trip
  settings: TripSettings
  days: TripDay[]
  activities: Activity[]
  items: ShoppingItem[]
  expense?: Expense | null
}

export function ExpenseFormSheet(props: ExpenseFormSheetProps) {
  if (!props.open) return null
  return <ExpenseForm {...props} />
}

function ExpenseForm({ onClose, trip, settings, days, activities, items, expense }: ExpenseFormSheetProps) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const formId = useId()
  const today = todayInTimeZone(trip.timezone)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [currency, setCurrency] = useState(expense?.currency ?? settings.baseCurrency)
  const [amount, setAmount] = useState(amountToInput(expense?.amount, expense?.currency ?? settings.baseCurrency))
  const [rate, setRate] = useState(amountToInput(expense?.exchangeRateToTHB))
  const [date, setDate] = useState(expense?.expenseDate ?? (today >= trip.startDate && today <= trip.endDate ? today : trip.startDate))
  const [category, setCategory] = useState(expense?.category ?? 'food')
  const [activityId, setActivityId] = useState(expense?.activityId ?? '')
  const [shoppingItemId, setShoppingItemId] = useState(expense?.shoppingItemId ?? '')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const tripRate = rateToTHB(currency, settings)
  const parsedAmount = parseAmountInput(amount)
  const parsedRate = parseAmountInput(rate)
  const effectiveRate = parsedRate !== null && Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : tripRate
  const preview =
    currency !== 'THB' && parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount >= 0
      ? computeAmountTHB(parsedAmount, currency, effectiveRate)
      : null
  const dayById = new Map(days.map((d) => [d.id, d]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issues: Record<string, string> = {}
    if (parsedAmount === null) issues.amount = t('v.required')
    else if (!Number.isFinite(parsedAmount)) issues.amount = t('v.number')
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate <= 0)) issues.exchangeRateToTHB = t('v.positive')
    setErrors(issues)
    setFormError(null)
    if (Object.keys(issues).length) return
    const input: ExpenseInput = {
      description,
      amount: parsedAmount!,
      currency,
      exchangeRateToTHB: currency === 'THB' ? null : parsedRate,
      expenseDate: date,
      category,
      activityId: activityId || null,
      shoppingItemId: shoppingItemId || null,
      notes,
    }
    setSaving(true)
    try {
      if (expense) await updateExpense(expense.id, input)
      else await createExpense(trip.id, input)
      showToast(t(expense ? 'common.saved' : 'expense.created'), { tone: 'success' })
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
    <Sheet open onClose={onClose} title={expense ? t('expense.editTitle') : t('expense.newTitle')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('expense.description')} htmlFor={id('desc')} error={errors.description}>
          <TextInput id={id('desc')} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('expense.descriptionPlaceholder')} invalid={!!errors.description} />
        </Field>
        <FieldRow>
          <Field label={t('expense.amount')} htmlFor={id('amount')} error={errors.amount}>
            <TextInput id={id('amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" invalid={!!errors.amount} />
          </Field>
          <Field label={t('shopping.currency')} htmlFor={id('cur')} error={errors.currency}>
            <Select id={id('cur')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <CurrencyOptions />
            </Select>
          </Field>
        </FieldRow>
        {currency !== 'THB' && (
          <Field
            label={t('expense.rate', { currency })}
            htmlFor={id('rate')}
            optional={t('common.optional')}
            error={errors.exchangeRateToTHB}
            hint={tripRate ? t('expense.rateHintTrip', { currency, rate: formatRate(tripRate, locale) }) : t('expense.rateHintNone')}
          >
            <TextInput id={id('rate')} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={tripRate ? formatRate(tripRate, locale) : '0.00'} invalid={!!errors.exchangeRateToTHB} />
          </Field>
        )}
        {preview !== null && (
          <p className="-mt-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14px]">
            ≈ <strong className="tabular-nums">{formatMoney(preview, 'THB', locale)}</strong>
            <span className="ml-1.5 text-[12px] text-muted">{t('expense.userRate')}</span>
          </p>
        )}
        <FieldRow>
          <Field label={t('expense.date')} htmlFor={id('date')} error={errors.expenseDate}>
            <TextInput id={id('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errors.expenseDate} />
          </Field>
          <Field label={t('expense.category')} htmlFor={id('cat')}>
            <Select id={id('cat')} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(EXPENSE_CATEGORY_LABEL[c])}
                </option>
              ))}
              {!EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number]) && <option value={category}>{category}</option>}
            </Select>
          </Field>
        </FieldRow>
        <Field label={t('expense.linkActivity')} htmlFor={id('act')} optional={t('common.optional')}>
          <Select id={id('act')} value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">—</option>
            {activities.map((a) => {
              const d = dayById.get(a.tripDayId)
              return (
                <option key={a.id} value={a.id}>
                  {d ? `${formatDate(d.date, locale, 'dayMonth')} · ` : ''}
                  {a.title}
                </option>
              )
            })}
          </Select>
        </Field>
        <Field label={t('expense.linkShopping')} htmlFor={id('shop')} optional={t('common.optional')} hint={shoppingItemId ? t('expense.linkShoppingHint') : undefined}>
          <Select id={id('shop')} value={shoppingItemId} onChange={(e) => setShoppingItemId(e.target.value)}>
            <option value="">—</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.notes')} htmlFor={id('notes')} optional={t('common.optional')}>
          <TextArea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}
