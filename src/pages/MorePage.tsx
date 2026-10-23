import { useState } from 'react'
import { Coins, Copy, Luggage, Pencil, Settings, Ticket, Wallet } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { TripFormSheet } from '@/components/trip/TripFormSheet'
import { DuplicateTripSheet, TripSettingsSheet } from '@/components/trip/TripSheets'
import { ListGroup, ListRow, SectionTitle } from '@/components/ui/Primitives'
import { useBookings, useExpenses } from '@/hooks/useData'
import { useI18n } from '@/i18n'

export function MorePage() {
  const { t } = useI18n()
  const { trip, settings } = useTripContext()
  const bookings = useBookings(trip.id, trip.timezone)
  const expenses = useExpenses(trip.id)
  const [editing, setEditing] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const base = `/trip/${trip.id}`

  return (
    <>
      <PageHeader title={t('more.title')} subtitle={trip.name} />
      <PageBody>
        <div className="flex flex-col gap-6">
          <ListGroup>
            <ListRow icon={Ticket} label={t('bookings.title')} description={t('more.bookingsHint')} value={bookings?.length ?? ''} to={`${base}/bookings`} />
            <ListRow icon={Wallet} label={t('expenses.title')} description={t('more.expensesHint')} value={expenses?.length ?? ''} to={`${base}/expenses`} />
          </ListGroup>
          <section>
            <SectionTitle>{t('more.thisTrip')}</SectionTitle>
            <ListGroup>
              <ListRow icon={Pencil} label={t('trip.editTitle')} onClick={() => setEditing(true)} />
              <ListRow icon={Coins} label={t('tripSettings.title')} value={settings.baseCurrency} onClick={() => setCurrencyOpen(true)} />
              <ListRow icon={Copy} label={t('trip.duplicate')} onClick={() => setCopying(true)} />
            </ListGroup>
          </section>
          <section>
            <SectionTitle>{t('more.app')}</SectionTitle>
            <ListGroup>
              <ListRow icon={Luggage} label={t('trips.title')} to="/trips" />
              <ListRow icon={Settings} label={t('settings.title')} description={t('more.settingsHint')} to="/settings" />
            </ListGroup>
          </section>
        </div>
      </PageBody>
      <TripFormSheet open={editing} trip={trip} onClose={() => setEditing(false)} />
      <TripSettingsSheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} trip={trip} settings={settings} />
      <DuplicateTripSheet trip={copying ? trip : null} onClose={() => setCopying(false)} />
    </>
  )
}
