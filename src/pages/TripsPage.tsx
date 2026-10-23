import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronDown, FlaskConical, Luggage, Plus, Settings } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { TripCard } from '@/components/trip/TripCard'
import { TripFormSheet } from '@/components/trip/TripFormSheet'
import { useTripMenu } from '@/components/trip/TripSheets'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, Fab, PageLoader, SectionTitle } from '@/components/ui/Primitives'
import { useTrips } from '@/hooks/useData'
import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { showToast } from '@/stores/uiStore'
import type { Trip } from '@/types/entities'
import { cn } from '@/utils/cn'
import { getDisplayStatus } from '@/utils/time'

export function TripsPage() {
  const i18n = useI18n()
  const { t } = i18n
  const navigate = useNavigate()
  const trips = useTrips()
  const now = useNow(60_000)
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const menu = useTripMenu()

  if (!trips) return <PageLoader />

  const withStatus = trips.map((trip) => ({ trip, status: getDisplayStatus(trip, now) }))
  const active = withStatus
    .filter((x) => x.status === 'ongoing' || x.status === 'upcoming' || x.status === 'planning')
    .sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate))
  const featured = active.find((x) => x.status === 'ongoing') ?? active[0]
  const upcoming = active.filter((x) => x !== featured)
  const past = withStatus.filter((x) => x.status === 'completed').sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate))
  const archived = withStatus.filter((x) => x.status === 'archived').sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate))

  const open = (trip: Trip) => navigate(`/trip/${trip.id}`)
  const card = (trip: Trip, featuredCard = false) => (
    <TripCard key={trip.id} trip={trip} now={now} featured={featuredCard} onOpen={() => open(trip)} onMenu={() => menu.openMenu(trip)} />
  )

  const loadSample = async () => {
    setLoadingSample(true)
    try {
      const { createSampleTrip } = await import('@/dev/sampleData')
      const trip = await createSampleTrip()
      showToast(t('sample.created'), { tone: 'success' })
      open(trip)
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    } finally {
      setLoadingSample(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t('trips.title')}
        actions={<IconButton icon={Settings} label={t('settings.title')} onClick={() => navigate('/settings')} />}
      />
      {trips.length === 0 ? (
        <EmptyState icon={Luggage} title={t('trips.emptyTitle')} message={t('trips.emptyMessage')}>
          <Button icon={Plus} size="lg" block onClick={() => setCreating(true)}>
            {t('trips.createFirst')}
          </Button>
          <Button icon={FlaskConical} variant="secondary" block loading={loadingSample} onClick={loadSample}>
            {t('sample.tryIt')}
          </Button>
        </EmptyState>
      ) : (
        <PageBody withFab>
          <div className="flex flex-col gap-7">
            {featured && (
              <section>
                <SectionTitle>{featured.status === 'ongoing' ? t('trips.current') : t('trips.next')}</SectionTitle>
                {card(featured.trip, true)}
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <SectionTitle>{t('trips.upcoming')}</SectionTitle>
                <div className="flex flex-col gap-3">{upcoming.map((x) => card(x.trip))}</div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <SectionTitle>{t('trips.past')}</SectionTitle>
                <div className="flex flex-col gap-3">{past.map((x) => card(x.trip))}</div>
              </section>
            )}
            {archived.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  aria-expanded={showArchived}
                  className="mb-2 flex h-9 items-center gap-1 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase"
                >
                  {t('trips.archived', { count: archived.length })}
                  <ChevronDown className={cn('size-4 transition-transform', showArchived && 'rotate-180')} aria-hidden />
                </button>
                {showArchived && <div className="flex flex-col gap-3">{archived.map((x) => card(x.trip))}</div>}
              </section>
            )}
          </div>
        </PageBody>
      )}
      {trips.length > 0 && <Fab label={t('trips.create')} onClick={() => setCreating(true)} />}
      <TripFormSheet open={creating} onClose={() => setCreating(false)} onSaved={open} />
      {menu.element}
    </>
  )
}
