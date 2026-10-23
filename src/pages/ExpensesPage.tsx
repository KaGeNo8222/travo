import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil, Receipt, Settings2, Trash2, TriangleAlert } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { EXPENSE_ICONS, ExpenseFormSheet, SpendingBars } from '@/components/expenses/ExpenseParts'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { TripSettingsSheet } from '@/components/trip/TripSheets'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, Fab, PageLoader, ProgressBar, SectionTitle, SegmentedControl } from '@/components/ui/Primitives'
import { ActionSheet } from '@/components/ui/Sheet'
import { useConfirm } from '@/hooks/useConfirm'
import { useActivities, useExpenses, useShoppingItems } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { formatDate, formatMoney, formatRate } from '@/i18n/format'
import { expenseCategoryLabel } from '@/i18n/labels'
import { deleteExpense } from '@/services/expenseService'
import { updateTripSettings } from '@/services/tripService'
import { showToast } from '@/stores/uiStore'
import type { Expense } from '@/types/entities'
import { HOME_CURRENCY } from '@/utils/currency'
import { sumMoney } from '@/utils/money'
import { buildSpendingLines, convertAmount, lineIn, summarizeSpending, type SpendingLine } from '@/utils/spending'

export function ExpensesPage() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const navigate = useNavigate()
  const { trip, days, settings } = useTripContext()
  const expenses = useExpenses(trip.id)
  const items = useShoppingItems(trip.id)
  const activities = useActivities(trip.id)
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [menuExpense, setMenuExpense] = useState<Expense | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const lines = useMemo(
    () => (expenses && items ? buildSpendingLines(expenses, items, settings, trip.timezone) : []),
    [expenses, items, settings, trip.timezone],
  )

  if (!expenses || !items || !activities) return <PageLoader />

  const currency = settings.displayCurrency
  const summary = summarizeSpending(lines, currency, settings)
  const budget =
    settings.budgetAmount != null ? convertAmount(settings.budgetAmount, settings.budgetCurrency ?? currency, currency, settings) : null
  const remaining = budget !== null ? sumMoney([budget, -summary.total], currency) : null
  const dayOrder = new Map(days.map((d) => [d.date, d.dayOrder]))
  const byDate = new Map<string, SpendingLine[]>()
  for (const line of [...lines].sort((a, b) => b.date.localeCompare(a.date))) {
    byDate.set(line.date, [...(byDate.get(line.date) ?? []), line])
  }
  const baseRate = settings.baseCurrency !== HOME_CURRENCY ? settings.exchangeRateToTHB : null

  const setDisplay = async (c: string) => {
    try {
      await updateTripSettings(trip.id, { displayCurrency: c })
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  const remove = async (e: Expense) => {
    if (await confirm({ title: t('expense.deleteTitle'), message: e.description, confirmLabel: t('common.delete'), danger: true })) {
      await deleteExpense(e.id)
      showToast(t('expense.deleted'))
    }
  }

  const openLine = (line: SpendingLine) => {
    if (line.source === 'shopping') navigate(`/trip/${trip.id}/shopping`)
    else setMenuExpense(expenses.find((e) => e.id === line.refId) ?? null)
  }

  return (
    <>
      <PageHeader title={t('expenses.title')} subtitle={trip.name} back={`/trip/${trip.id}/more`} />
      <PageBody withFab>
        <div className="flex flex-col gap-6">
          {settings.baseCurrency !== HOME_CURRENCY && (
            <SegmentedControl
              label={t('tripSettings.displayCurrency')}
              value={currency}
              onChange={(c) => void setDisplay(c)}
              options={[HOME_CURRENCY, settings.baseCurrency].map((c) => ({ value: c, label: t('expenses.showIn', { currency: c }) }))}
            />
          )}
          <Card className="p-4">
            <p className="text-[13px] text-muted">{t('expenses.total')}</p>
            <p className="text-[32px] leading-tight font-bold tabular-nums">{formatMoney(summary.total, currency, locale)}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {t('expenses.breakdown', {
                expenses: formatMoney(summary.expenseTotal, currency, locale),
                shopping: formatMoney(summary.shoppingTotal, currency, locale),
              })}
            </p>
            {budget !== null && remaining !== null && (
              <div className="mt-4">
                <ProgressBar value={budget > 0 ? summary.total / budget : 1} tone={remaining < 0 ? 'danger' : 'primary'} label={t('expenses.budget')} />
                <div className="mt-1.5 flex justify-between text-[13px]">
                  <span className="text-muted">
                    {t('expenses.budget')} {formatMoney(budget, currency, locale)}
                  </span>
                  <span className={remaining < 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>
                    {remaining < 0
                      ? t('expenses.overBudget', { amount: formatMoney(-remaining, currency, locale) })
                      : t('expenses.remaining', { amount: formatMoney(remaining, currency, locale) })}
                  </span>
                </div>
              </div>
            )}
            {settings.budgetAmount != null && budget === null && <p className="mt-3 text-[13px] text-warning">{t('expenses.budgetNoRate')}</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-[13px] text-muted">
                {baseRate
                  ? t('expenses.rateLine', { base: settings.baseCurrency, rate: formatRate(baseRate, locale) })
                  : settings.baseCurrency !== HOME_CURRENCY
                    ? t('expenses.noRate', { base: settings.baseCurrency })
                    : t('expenses.thbOnly')}
              </p>
              <Button size="sm" variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>
                {t('expenses.editRates')}
              </Button>
            </div>
          </Card>

          {summary.unconverted.length > 0 && (
            <div role="status" className="flex gap-2.5 rounded-xl bg-warning-soft p-3.5 text-sm text-warning">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              <p>
                {t('expenses.unconverted', {
                  count: summary.unconverted.length,
                  currencies: [...new Set(summary.unconverted.map((l) => l.currency))].join(', '),
                })}
              </p>
            </div>
          )}

          {lines.length === 0 ? (
            <EmptyState icon={Receipt} title={t('expenses.emptyTitle')} message={t('expenses.emptyMessage')} />
          ) : (
            <>
              <section>
                <SectionTitle>{t('expenses.byCategory')}</SectionTitle>
                <Card className="p-4">
                  <SpendingBars currency={currency} rows={summary.byCategory.map((c) => ({ key: c.category, label: expenseCategoryLabel(c.category, i18n), total: c.total }))} />
                </Card>
              </section>
              <section>
                <SectionTitle>{t('expenses.byDay')}</SectionTitle>
                <Card className="p-4">
                  <SpendingBars
                    currency={currency}
                    rows={summary.byDay.map((d) => ({
                      key: d.date,
                      label: `${dayOrder.has(d.date) ? `${t('itinerary.dayShort', { n: dayOrder.get(d.date)! })} · ` : ''}${formatDate(d.date, locale, 'weekday')}`,
                      total: d.total,
                    }))}
                  />
                </Card>
              </section>
              <section>
                <SectionTitle>{t('expenses.items')}</SectionTitle>
                <div className="flex flex-col gap-4">
                  {[...byDate].map(([date, dayLines]) => (
                    <div key={date}>
                      <p className="mb-1.5 px-1 text-[13px] font-medium text-muted">{formatDate(date, locale, 'long')}</p>
                      <Card className="divide-y divide-line overflow-hidden">
                        {dayLines.map((line) => {
                          const Icon = EXPENSE_ICONS[line.category] ?? Receipt
                          const converted = lineIn(line, currency, settings)
                          return (
                            <button key={line.key} type="button" onClick={() => openLine(line)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                                <Icon className="size-[18px]" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px]">{line.description}</span>
                                <span className="block truncate text-[12px] text-muted">
                                  {expenseCategoryLabel(line.category, i18n)}
                                  {line.source === 'shopping' && ` · ${t('expenses.fromShopping')}`}
                                  {line.estimated && ` · ${t('expenses.estimatedPrice')}`}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-[15px] font-semibold tabular-nums">{formatMoney(line.amount, line.currency, locale)}</span>
                                {line.currency !== currency && (
                                  <span className="block text-[12px] text-muted tabular-nums">
                                    {converted !== null ? `≈ ${formatMoney(converted, currency, locale)}` : t('expenses.noRateShort')}
                                  </span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </Card>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          <p className="text-center text-[12px] text-subtle">{t('expenses.manualRatesNote')}</p>
        </div>
      </PageBody>
      <Fab label={t('expenses.add')} onClick={() => setEditing('new')} />
      <ExpenseFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        trip={trip}
        settings={settings}
        days={days}
        activities={activities}
        items={items}
        expense={editing === 'new' ? null : editing}
      />
      <TripSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} trip={trip} settings={settings} />
      <ActionSheet
        open={!!menuExpense}
        onClose={() => setMenuExpense(null)}
        title={menuExpense?.description}
        actions={
          menuExpense
            ? [
                { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(menuExpense) },
                { label: t('common.delete'), icon: Trash2, tone: 'danger', onSelect: () => void remove(menuExpense) },
              ]
            : []
        }
      />
    </>
  )
}
