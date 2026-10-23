import { useId, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Archive, ArchiveRestore, ArrowRight, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useExpenses, useShoppingItems } from '@/hooks/useData'
import { useConfirm } from '@/hooks/useConfirm'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { formatRate } from '@/i18n/format'
import { deleteTrip, duplicateTrip, getTripStats, setTripStatus, updateTripSettings } from '@/services/tripService'
import { showToast } from '@/stores/uiStore'
import type { Trip, TripSettings } from '@/types/entities'
import { HOME_CURRENCY, SUPPORTED_CURRENCIES } from '@/utils/currency'
import { amountToInput, parseAmountInput } from '@/utils/money'
import { Field, FieldRow, FormError, Select, TextInput } from '../ui/Field'
import { SegmentedControl } from '../ui/Primitives'
import { ActionSheet, Sheet, SheetSubmit, type ActionItem } from '../ui/Sheet'
import { CurrencyOptions, TripFormSheet } from './TripFormSheet'

export function DuplicateTripSheet({ trip, onClose }: { trip: Trip | null; onClose: () => void }) {
  if (!trip) return null
  return <DuplicateForm trip={trip} onClose={onClose} />
}

function DuplicateForm({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const navigate = useNavigate()
  const formId = useId()
  const [name, setName] = useState(`${trip.name} ${t('trip.copySuffix')}`)
  const [startDate, setStartDate] = useState(trip.startDate)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const copy = await duplicateTrip(trip.id, { name, startDate })
      showToast(t('trip.duplicated'), { tone: 'success' })
      onClose()
      navigate(`/trip/${copy.id}`)
    } catch (err) {
      const fields = fieldErrors(err, i18n)
      if (fields) setErrors(fields)
      else setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('trip.duplicateTitle')} footer={<SheetSubmit form={formId} label={t('trip.duplicate')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('trip.name')} htmlFor={`${formId}-name`} error={errors.name}>
          <TextInput id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label={t('trip.newStartDate')} htmlFor={`${formId}-start`} hint={t('trip.duplicateShiftHint')} error={errors.startDate ?? errors.endDate}>
          <TextInput id={`${formId}-start`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <p className="rounded-xl bg-surface-2 p-3.5 text-sm leading-relaxed text-muted">{t('trip.duplicateInfo')}</p>
      </form>
    </Sheet>
  )
}

export function TripSettingsSheet({ open, onClose, trip, settings }: { open: boolean; onClose: () => void; trip: Trip; settings: TripSettings }) {
  if (!open) return null
  return <TripSettingsForm onClose={onClose} trip={trip} settings={settings} />
}

function TripSettingsForm({ onClose, trip, settings }: { onClose: () => void; trip: Trip; settings: TripSettings }) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const formId = useId()
  const items = useShoppingItems(trip.id)
  const expenses = useExpenses(trip.id)
  const [base, setBase] = useState(settings.baseCurrency)
  const [rate, setRate] = useState(amountToInput(settings.exchangeRateToTHB))
  const [display, setDisplay] = useState(settings.displayCurrency)
  const [budget, setBudget] = useState(amountToInput(settings.budgetAmount))
  const [budgetCurrency, setBudgetCurrency] = useState(settings.budgetCurrency ?? settings.displayCurrency)
  const [otherRates, setOtherRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(settings.otherRatesToTHB ?? {}).map(([c, r]) => [c, amountToInput(r)])),
  )
  const [addCurrency, setAddCurrency] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Currencies already used on this trip that still need a rate.
  const usedOther = useMemo(() => {
    const set = new Set<string>()
    for (const i of items ?? []) set.add(i.currency)
    for (const e of expenses ?? []) set.add(e.currency)
    set.delete(HOME_CURRENCY)
    set.delete(base)
    return [...set]
  }, [items, expenses, base])
  const otherCodes = [...new Set([...usedOther, ...Object.keys(otherRates)])].filter((c) => c !== base && c !== HOME_CURRENCY).sort()
  const pairCurrencies = base === HOME_CURRENCY ? [HOME_CURRENCY] : [HOME_CURRENCY, base]

  // Display and budget currencies are either THB or the base currency; follow the base.
  const changeBase = (next: string) => {
    setBase(next)
    if (display !== HOME_CURRENCY) setDisplay(next)
    if (budgetCurrency !== HOME_CURRENCY) setBudgetCurrency(next)
  }

  const parseRate = (text: string, field: string, issues: Record<string, string>): number | null => {
    const value = parseAmountInput(text)
    if (value === null) return null
    if (!Number.isFinite(value) || value <= 0) issues[field] = t('v.positive')
    return value
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issues: Record<string, string> = {}
    const baseRate = base === HOME_CURRENCY ? null : parseRate(rate, 'exchangeRateToTHB', issues)
    const budgetValue = parseAmountInput(budget)
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) issues.budgetAmount = t('v.nonNegative')
    const others: Record<string, number> = {}
    for (const code of otherCodes) {
      const value = parseRate(otherRates[code] ?? '', `rate-${code}`, issues)
      if (value !== null) others[code] = value
    }
    setErrors(issues)
    if (Object.keys(issues).length) return
    setSaving(true)
    setFormError(null)
    try {
      await updateTripSettings(trip.id, {
        baseCurrency: base,
        exchangeRateToTHB: baseRate,
        displayCurrency: pairCurrencies.includes(display) ? display : HOME_CURRENCY,
        budgetAmount: budgetValue,
        budgetCurrency: budgetValue === null ? null : budgetCurrency,
        otherRatesToTHB: others,
      })
      showToast(t('common.saved'), { tone: 'success' })
      onClose()
    } catch (err) {
      setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('tripSettings.title')} footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FormError message={formError} />
        <Field label={t('trip.baseCurrency')} htmlFor={`${formId}-base`} hint={t('trip.baseCurrencyHint')}>
          <Select id={`${formId}-base`} value={base} onChange={(e) => changeBase(e.target.value)}>
            <CurrencyOptions />
          </Select>
        </Field>
        {base !== HOME_CURRENCY && (
          <Field
            label={t('tripSettings.rateLabel', { currency: base })}
            htmlFor={`${formId}-rate`}
            error={errors.exchangeRateToTHB}
            hint={t('tripSettings.rateHint')}
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[15px] text-muted">1 {base} =</span>
              <TextInput id={`${formId}-rate`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" invalid={!!errors.exchangeRateToTHB} />
              <span className="shrink-0 text-[15px] text-muted">THB</span>
            </div>
          </Field>
        )}
        {otherCodes.map((code) => (
          <Field key={code} label={t('tripSettings.rateLabel', { currency: code })} htmlFor={`${formId}-rate-${code}`} error={errors[`rate-${code}`]}>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[15px] text-muted">1 {code} =</span>
              <TextInput
                id={`${formId}-rate-${code}`}
                inputMode="decimal"
                value={otherRates[code] ?? ''}
                onChange={(e) => setOtherRates((r) => ({ ...r, [code]: e.target.value }))}
                placeholder="0.00"
              />
              <span className="shrink-0 text-[15px] text-muted">THB</span>
              {!usedOther.includes(code) && (
                <button
                  type="button"
                  aria-label={t('common.remove')}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-subtle active:bg-surface-2"
                  onClick={() =>
                    setOtherRates((r) => {
                      const next = { ...r }
                      delete next[code]
                      return next
                    })
                  }
                >
                  <X className="size-5" aria-hidden />
                </button>
              )}
            </div>
          </Field>
        ))}
        <div className="flex gap-2">
          <Select value={addCurrency} onChange={(e) => setAddCurrency(e.target.value)} aria-label={t('tripSettings.addRate')}>
            <option value="">{t('tripSettings.addRate')}</option>
            {SUPPORTED_CURRENCIES.filter((c) => c !== base && c !== HOME_CURRENCY && !otherCodes.includes(c)).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!addCurrency}
            onClick={() => {
              setOtherRates((r) => ({ ...r, [addCurrency]: '' }))
              setAddCurrency('')
            }}
            aria-label={t('common.add')}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
        <p className="rounded-xl bg-warning-soft p-3.5 text-[13px] leading-relaxed text-warning">{t('tripSettings.manualRateNotice')}</p>

        {pairCurrencies.length > 1 && (
          <Field label={t('tripSettings.displayCurrency')}>
            <SegmentedControl label={t('tripSettings.displayCurrency')} value={display} onChange={setDisplay} options={pairCurrencies.map((c) => ({ value: c, label: c }))} />
          </Field>
        )}
        <FieldRow>
          <Field label={t('tripSettings.budget')} htmlFor={`${formId}-budget`} optional={t('common.optional')} error={errors.budgetAmount}>
            <TextInput id={`${formId}-budget`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" invalid={!!errors.budgetAmount} />
          </Field>
          <Field label={t('tripSettings.budgetCurrency')} htmlFor={`${formId}-bcur`}>
            <Select id={`${formId}-bcur`} value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)}>
              {pairCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        {settings.exchangeRateToTHB && base === settings.baseCurrency && (
          <p className="text-[13px] text-subtle">
            {t('tripSettings.currentRate', { base, rate: formatRate(settings.exchangeRateToTHB, locale) })}
          </p>
        )}
      </form>
    </Sheet>
  )
}

/** Trip action menu (open, edit, duplicate, archive, delete) shared by several screens. */
export function useTripMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const confirm = useConfirm()
  const [menuTrip, setMenuTrip] = useState<Trip | null>(null)
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [copyTrip, setCopyTrip] = useState<Trip | null>(null)

  const toggleArchive = async (trip: Trip) => {
    const archived = trip.status === 'archived'
    const previous = trip.status
    await setTripStatus(trip.id, archived ? 'planning' : 'archived')
    showToast(t(archived ? 'trip.unarchived' : 'trip.archived'), {
      action: { label: t('common.undo'), onClick: () => void setTripStatus(trip.id, previous) },
    })
  }

  const remove = async (trip: Trip) => {
    const stats = await getTripStats(trip.id)
    const ok = await confirm({
      title: t('trip.deleteTitle', { name: trip.name }),
      message: t('trip.deleteMessage'),
      details: [
        t('trip.deleteCounts', {
          activities: stats.activities,
          places: stats.places,
          shopping: stats.shoppingItems,
          bookings: stats.bookings,
          expenses: stats.expenses,
          files: stats.attachments,
        }),
      ],
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await deleteTrip(trip.id)
    showToast(t('trip.deleted'))
    if (location.pathname.startsWith(`/trip/${trip.id}`)) navigate('/trips', { replace: true })
  }

  const actions: ActionItem[] = menuTrip
    ? [
        { label: t('trip.open'), icon: ArrowRight, onSelect: () => navigate(`/trip/${menuTrip.id}`) },
        { label: t('common.edit'), icon: Pencil, onSelect: () => setEditTrip(menuTrip) },
        { label: t('trip.duplicate'), icon: Copy, onSelect: () => setCopyTrip(menuTrip) },
        {
          label: menuTrip.status === 'archived' ? t('trip.unarchive') : t('trip.archive'),
          icon: menuTrip.status === 'archived' ? ArchiveRestore : Archive,
          onSelect: () => void toggleArchive(menuTrip),
        },
        { label: t('common.delete'), icon: Trash2, tone: 'danger', onSelect: () => void remove(menuTrip) },
      ]
    : []

  const element = (
    <>
      <ActionSheet open={!!menuTrip} onClose={() => setMenuTrip(null)} title={menuTrip?.name} actions={actions} />
      <TripFormSheet open={!!editTrip} trip={editTrip} onClose={() => setEditTrip(null)} />
      <DuplicateTripSheet trip={copyTrip} onClose={() => setCopyTrip(null)} />
    </>
  )
  return { openMenu: setMenuTrip, openEdit: setEditTrip, element }
}
