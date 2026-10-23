import { CalendarDays, Ellipsis, MapPin, Plane } from 'lucide-react'
import { useI18n } from '@/i18n'
import { formatDateRange } from '@/i18n/format'
import { TRIP_STATUS_LABEL } from '@/i18n/labels'
import type { Trip, TripStatus } from '@/types/entities'
import { cn } from '@/utils/cn'
import { daysBetween, getDisplayStatus, todayInTimeZone, tripLengthDays } from '@/utils/time'
import { AttachmentImage } from '../ui/Images'
import { Badge, Card, type BadgeTone } from '../ui/Primitives'

export const STATUS_TONE: Record<TripStatus, BadgeTone> = {
  planning: 'neutral',
  upcoming: 'primary',
  ongoing: 'success',
  completed: 'neutral',
  archived: 'warning',
}

export function CoverPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-[#1c3a66] to-[#0f2240] text-white/70', className)}>
      <Plane className="size-10" aria-hidden />
    </div>
  )
}

/** "In 12 days" / "Day 3 of 5" / nothing, in the trip's own time zone. */
export function useTripCountdown(trip: Trip, now: Date): string | null {
  const { t } = useI18n()
  const status = getDisplayStatus(trip, now)
  const today = todayInTimeZone(trip.timezone, now)
  if (status === 'ongoing') {
    return t('trip.dayOf', { day: daysBetween(trip.startDate, today) + 1, total: tripLengthDays(trip) })
  }
  if (status === 'planning' || status === 'upcoming') {
    const n = daysBetween(today, trip.startDate)
    return n === 1 ? t('trip.startsTomorrow') : t('trip.startsIn', { days: n })
  }
  return null
}

interface TripCardProps {
  trip: Trip
  now: Date
  featured?: boolean
  onOpen: () => void
  onMenu: () => void
}

export function TripCard({ trip, now, featured, onOpen, onMenu }: TripCardProps) {
  const { t, locale } = useI18n()
  const status = getDisplayStatus(trip, now)
  const countdown = useTripCountdown(trip, now)
  const destination = [trip.destinationCountry, ...trip.destinationCities].filter(Boolean).join(' · ')
  const days = tripLengthDays(trip)

  return (
    <Card className="relative overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full text-left active:opacity-90">
        <div className={cn('relative', featured ? 'aspect-[16/10]' : 'aspect-[16/6]')}>
          {trip.coverImageId ? (
            <AttachmentImage id={trip.coverImageId} alt="" className="size-full" />
          ) : (
            <CoverPlaceholder className="size-full" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="absolute top-3 left-3">
            <Badge tone={STATUS_TONE[status]} className="shadow-sm">
              {t(TRIP_STATUS_LABEL[status])}
            </Badge>
          </div>
          <div className="absolute inset-x-4 bottom-3 text-white">
            <h3 className={cn('font-bold drop-shadow-sm', featured ? 'text-2xl' : 'text-lg')}>{trip.name}</h3>
            {countdown && <p className="text-sm font-medium text-white/90">{countdown}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3 text-[14px] text-muted">
          <span className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{destination}</span>
          </span>
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            {formatDateRange(trip.startDate, trip.endDate, locale)} · {t('trip.days', { days })}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onMenu}
        aria-label={t('trip.actions', { name: trip.name })}
        className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm active:bg-black/55"
      >
        <Ellipsis className="size-5" aria-hidden />
      </button>
    </Card>
  )
}
