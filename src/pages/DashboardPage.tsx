import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeftRight, BedDouble, CalendarDays, ChevronRight, Ellipsis, Navigation, Plane, ShoppingBag, type LucideIcon } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { formatMinutes } from '@/components/itinerary/ActivityCard'
import { bookingDurationMinutes, dayOffset, pickFlight, pickHotel } from '@/components/bookings/bookingTimes'
import { MapsButton } from '@/components/places/MapsLinks'
import { CoverPlaceholder, STATUS_TONE, useTripCountdown } from '@/components/trip/TripCard'
import { useTripMenu } from '@/components/trip/TripSheets'
import { AttachmentImage } from '@/components/ui/Images'
import { Badge, Card, PageLoader, SectionTitle } from '@/components/ui/Primitives'
import { useActivities, useBookings, usePlaces, useShoppingItems } from '@/hooks/useData'
import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { formatClock, formatDate, formatDateRange, formatLocalDateTime, formatMoney } from '@/i18n/format'
import { TRIP_STATUS_LABEL } from '@/i18n/labels'
import type { Activity, Booking } from '@/types/entities'
import { cn } from '@/utils/cn'
import { buildDirectionsUrl, canOpenInMaps } from '@/utils/maps'
import { findCurrentOrNext, splitSchedule } from '@/utils/schedule'
import { computeShoppingTotals } from '@/utils/shopping'
import { getDisplayStatus, gmtOffsetLabel, todayInTimeZone } from '@/utils/time'

function QuickAction({ icon: Icon, label, caption, to, href, disabled }: { icon: LucideIcon; label: string; caption?: string; to?: string; href?: string; disabled?: boolean }) {
  const cls = cn(
    'flex min-h-24 flex-col justify-between gap-2 rounded-2xl p-3.5 text-left transition-opacity',
    disabled ? 'bg-surface-2 text-subtle' : 'bg-primary text-primary-fg active:opacity-85',
  )
  const body = (
    <>
      <Icon className="size-6" aria-hidden />
      <span>
        <span className="block text-[15px] leading-tight font-semibold">{label}</span>
        {caption && <span className={cn('mt-0.5 block truncate text-[12px]', disabled ? 'text-subtle' : 'text-primary-fg/75')}>{caption}</span>}
      </span>
    </>
  )
  if (disabled) return <div className={cls} aria-disabled="true">{body}</div>
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    )
  }
  return (
    <Link to={to!} className={cls}>
      {body}
    </Link>
  )
}

export function DashboardPage() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const navigate = useNavigate()
  const { trip, days, settings } = useTripContext()
  const activities = useActivities(trip.id)
  const places = usePlaces(trip.id)
  const bookings = useBookings(trip.id, trip.timezone)
  const items = useShoppingItems(trip.id)
  const now = useNow(30_000)
  const menu = useTripMenu()
  const countdown = useTripCountdown(trip, now)
  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places])

  if (!activities || !places || !bookings || !items) return <PageLoader />

  const status = getDisplayStatus(trip, now)
  const today = todayInTimeZone(trip.timezone, now)
  const todayDay = days.find((d) => d.date === today)
  const focusDay = todayDay ?? (today < trip.startDate ? days[0] : undefined)
  const upcoming = findCurrentOrNext(days, activities, trip.timezone, now)
  const upcomingPlace = upcoming?.activity.placeId ? placeById.get(upcoming.activity.placeId) : undefined
  const flight = pickFlight(bookings, trip.timezone, now)
  const hotel = pickHotel(bookings, trip.timezone, now)
  const hotelPlace = hotel?.placeId ? placeById.get(hotel.placeId) : undefined
  const shopping = computeShoppingTotals(items, settings.displayCurrency, settings)
  const focusActivities = focusDay ? splitSchedule(activities.filter((a) => a.tripDayId === focusDay.id)) : null
  const base = `/trip/${trip.id}`

  const startsIn = (a: { start: Date; isCurrent: boolean }) => {
    if (a.isCurrent) return t('activity.happeningNow')
    const minutes = Math.max(1, Math.round((a.start.getTime() - now.getTime()) / 60000))
    return minutes < 24 * 60 ? t('activity.startsIn', { time: formatMinutes(minutes, t) }) : formatDate(upcoming!.day.date, locale, 'weekday')
  }

  return (
    <>
      <div className="relative">
        <div className="relative aspect-[4/3] max-h-[46dvh] w-full overflow-hidden min-[480px]:aspect-[16/9]">
          {trip.coverImageId ? <AttachmentImage id={trip.coverImageId} alt="" className="size-full" /> : <CoverPlaceholder className="size-full" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/75" />
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
          <button
            type="button"
            onClick={() => navigate('/trips')}
            className="flex h-10 items-center gap-1.5 rounded-full bg-black/35 px-3.5 text-sm font-medium text-white backdrop-blur-md active:bg-black/55"
          >
            <ArrowLeftRight className="size-4" aria-hidden />
            {t('dashboard.switchTrip')}
          </button>
          <button
            type="button"
            onClick={() => menu.openMenu(trip)}
            aria-label={t('trip.actions', { name: trip.name })}
            className="flex size-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md active:bg-black/55"
          >
            <Ellipsis className="size-5" aria-hidden />
          </button>
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <Badge tone={STATUS_TONE[status]} className="mb-2">
            {t(TRIP_STATUS_LABEL[status])}
          </Badge>
          <h1 className="text-[28px] leading-tight font-bold drop-shadow">{trip.name}</h1>
          <p className="mt-1 text-[14px] text-white/85">
            {[trip.destinationCountry, ...trip.destinationCities].join(' · ')} · {formatDateRange(trip.startDate, trip.endDate, locale)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-4 pb-8">
        <Card className="flex items-center gap-4 p-4">
          <div>
            <p className="text-[34px] leading-none font-bold tracking-tight tabular-nums">{formatClock(now, trip.timezone)}</p>
            <p className="mt-1 text-[13px] text-muted">
              {formatDate(today, locale, 'weekday')} · {gmtOffsetLabel(trip.timezone, now)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[13px] text-muted">{t('dashboard.localTime')}</p>
            <p className="text-[15px] font-semibold">{countdown ?? t(TRIP_STATUS_LABEL[status])}</p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction icon={CalendarDays} label={t('dashboard.todayPlan')} caption={focusDay ? formatDate(focusDay.date, locale, 'dayMonth') : undefined} to={`${base}/plan${focusDay ? `?day=${focusDay.date}` : ''}`} />
          <QuickAction
            icon={Navigation}
            label={t('dashboard.navigateNext')}
            caption={upcomingPlace ? upcomingPlace.name : t('dashboard.noNextPlace')}
            href={upcomingPlace && canOpenInMaps(upcomingPlace) ? buildDirectionsUrl(upcomingPlace, upcoming?.activity.transportMode) : undefined}
            disabled={!upcomingPlace || !canOpenInMaps(upcomingPlace)}
          />
          <QuickAction icon={ShoppingBag} label={t('dashboard.shoppingList')} caption={t('dashboard.itemsLeft', { count: shopping.itemsLeft })} to={`${base}/shopping`} />
        </div>

        {upcoming && (
          <section>
            <SectionTitle>{upcoming.isCurrent ? t('activity.now') : t('activity.next')}</SectionTitle>
            <Card className="p-4">
              <p className="text-[13px] font-semibold text-primary">
                {upcoming.activity.startTime}
                {upcoming.activity.endTime && `–${upcoming.activity.endTime}`} · {startsIn(upcoming)}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{upcoming.activity.title}</h3>
              {upcomingPlace && <p className="text-[14px] text-muted">{upcomingPlace.name}</p>}
              <div className="mt-3 flex gap-2">
                <MapsButton place={upcomingPlace} kind="directions" mode={upcoming.activity.transportMode} variant="primary" />
                <MapsButton place={upcomingPlace} />
              </div>
            </Card>
          </section>
        )}

        {(flight || hotel) && (
          <section>
            <SectionTitle action={<Link to={`${base}/bookings`} className="text-sm font-medium text-primary">{t('common.seeAll')}</Link>}>
              {t('dashboard.travelInfo')}
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {flight && <FlightSummary booking={flight} tripTz={trip.timezone} />}
              {hotel && (
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <BedDouble className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{hotel.title}</h3>
                      <p className="text-[13px] text-muted">
                        {hotel.startLocalDateTime && `${t('booking.checkIn')} ${formatLocalDateTime(hotel.startLocalDateTime, locale).date}`}
                        {hotel.endLocalDateTime && ` → ${formatLocalDateTime(hotel.endLocalDateTime, locale).date}`}
                      </p>
                      {hotel.address && <p className="mt-0.5 truncate text-[13px] text-subtle">{hotel.address}</p>}
                    </div>
                  </div>
                  {hotelPlace && (
                    <div className="mt-3 flex gap-2">
                      <MapsButton place={hotelPlace} kind="directions" />
                      <MapsButton place={hotelPlace} />
                    </div>
                  )}
                </Card>
              )}
            </div>
          </section>
        )}

        {focusDay && focusActivities && (
          <section>
            <SectionTitle action={<Link to={`${base}/plan?day=${focusDay.date}`} className="text-sm font-medium text-primary">{t('common.seeAll')}</Link>}>
              {todayDay ? t('dashboard.today') : t('dashboard.firstDay')}
            </SectionTitle>
            <Card className="divide-y divide-line">
              {focusActivities.scheduled.length + focusActivities.unscheduled.length === 0 ? (
                <p className="p-4 text-[15px] text-muted">{t('itinerary.emptyDay')}</p>
              ) : (
                [...focusActivities.scheduled, ...focusActivities.unscheduled].slice(0, 6).map((a) => (
                  <TodayRow key={a.id} activity={a} highlight={upcoming?.activity.id === a.id} placeName={a.placeId ? placeById.get(a.placeId)?.name : undefined} to={`${base}/plan?day=${focusDay.date}`} />
                ))
              )}
            </Card>
          </section>
        )}

        <section>
          <SectionTitle action={<Link to={`${base}/shopping`} className="text-sm font-medium text-primary">{t('common.seeAll')}</Link>}>
            {t('dashboard.shoppingRemaining')}
          </SectionTitle>
          <Link to={`${base}/shopping`} className="block">
            <Card className="flex items-center gap-4 p-4 active:bg-surface-2">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <ShoppingBag className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t('dashboard.itemsLeft', { count: shopping.itemsLeft })}</p>
                <p className="text-[13px] text-muted">
                  {t('shopping.estimatedLeft', { amount: formatMoney(shopping.remaining, shopping.currency, locale) })}
                </p>
              </div>
              <ChevronRight className="size-5 text-subtle" aria-hidden />
            </Card>
          </Link>
        </section>
      </div>
      {menu.element}
    </>
  )
}

function TodayRow({ activity, highlight, placeName, to }: { activity: Activity; highlight: boolean; placeName?: string; to: string }) {
  const done = activity.status !== 'planned'
  return (
    <Link to={to} className={cn('flex items-center gap-3 px-4 py-3 active:bg-surface-2', highlight && 'bg-primary-soft')}>
      <span className="w-11 shrink-0 text-[14px] font-semibold tabular-nums">{activity.startTime ?? '—'}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px]', done && 'text-muted line-through')}>{activity.title}</span>
        {placeName && <span className="block truncate text-[12px] text-muted">{placeName}</span>}
      </span>
    </Link>
  )
}

export function FlightSummary({ booking, tripTz }: { booking: Booking; tripTz: string }) {
  const { t, locale } = useI18n()
  const start = booking.startLocalDateTime ? formatLocalDateTime(booking.startLocalDateTime, locale) : null
  const end = booking.endLocalDateTime ? formatLocalDateTime(booking.endLocalDateTime, locale) : null
  const duration = bookingDurationMinutes(booking, tripTz)
  const offset = dayOffset(booking)
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Plane className="size-4" aria-hidden />
        <span className="font-medium text-fg">{[booking.provider, booking.flightNumber].filter(Boolean).join(' ') || booking.title}</span>
        {start && <span className="ml-auto">{start.date}</span>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-2xl leading-none font-bold">{booking.origin || '—'}</p>
          <p className="mt-1 text-[14px] font-semibold tabular-nums">{start?.time ?? '--:--'}</p>
        </div>
        <div className="flex flex-1 flex-col items-center text-[12px] text-subtle">
          <span>{duration !== null && duration >= 0 ? formatMinutes(duration, t) : ''}</span>
          <span className="my-1 h-px w-full bg-line" />
          <Plane className="size-4 rotate-45 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-2xl leading-none font-bold">{booking.destination || '—'}</p>
          <p className="mt-1 text-[14px] font-semibold tabular-nums">
            {end?.time ?? '--:--'}
            {offset > 0 && <sup className="ml-0.5 text-[11px] text-warning">+{offset}</sup>}
          </p>
        </div>
      </div>
      {booking.terminal && <p className="mt-2 text-[13px] text-muted">{t('booking.terminal')}: {booking.terminal}</p>}
    </Card>
  )
}
