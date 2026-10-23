import { ArrowDown, ArrowUp, Check, Ellipsis, MapPin, TriangleAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import { ACTIVITY_STATUS_LABEL, TRANSPORT_MODE_LABEL, activityTypeLabel } from '@/i18n/labels'
import type { Activity, Place } from '@/types/entities'
import { cn } from '@/utils/cn'
import { endsNextDay } from '@/utils/schedule'
import { MapsButton } from '../places/MapsLinks'
import { Badge } from '../ui/Primitives'

export function formatMinutes(minutes: number, t: ReturnType<typeof useI18n>['t']): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return t('time.hoursMinutes', { h, m })
  if (h) return t('time.hours', { h })
  return t('time.minutes', { m })
}

interface ActivityCardProps {
  activity: Activity
  place: Place | undefined
  highlight?: 'current' | 'next'
  overlapsWith?: string[]
  onToggleComplete: () => void
  onMenu: () => void
  onOpen: () => void
  reorder?: { onUp?: () => void; onDown?: () => void }
}

export function ActivityCard({ activity, place, highlight, overlapsWith, onToggleComplete, onMenu, onOpen, reorder }: ActivityCardProps) {
  const i18n = useI18n()
  const { t } = i18n
  const done = activity.status === 'completed'
  const skipped = activity.status === 'skipped'

  return (
    <div className="flex gap-3">
      <div className="w-12 shrink-0 pt-3.5 text-right">
        {activity.startTime ? (
          <>
            <p className="text-[15px] leading-none font-semibold tabular-nums">{activity.startTime}</p>
            {activity.endTime && (
              <p className="mt-1 text-[12px] leading-none text-subtle tabular-nums">
                {activity.endTime}
                {endsNextDay(activity) && <sup className="ml-0.5">+1</sup>}
              </p>
            )}
          </>
        ) : (
          <span className="text-[12px] text-subtle">—</span>
        )}
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-2xl border bg-surface p-3.5 transition-shadow',
          highlight ? 'border-primary ring-2 ring-primary/20' : 'border-line',
          (done || skipped) && 'bg-surface-2',
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggleComplete}
            aria-pressed={done}
            aria-label={done ? t('activity.markPlanned') : t('activity.markDone')}
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              done ? 'border-success bg-success text-white' : 'border-line text-transparent active:bg-surface-2',
            )}
          >
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </button>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            {highlight && (
              <p className="mb-0.5 text-[12px] font-semibold text-primary">{highlight === 'current' ? t('activity.now') : t('activity.next')}</p>
            )}
            <h3 className={cn('text-[16px] leading-snug font-semibold', (done || skipped) && 'text-muted line-through decoration-1')}>{activity.title}</h3>
            {place && (
              <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{place.name}</span>
              </p>
            )}
            {(activity.transportMode || activity.travelMinutes) && (
              <p className="mt-0.5 text-[13px] text-subtle">
                {[
                  activity.transportMode && t(TRANSPORT_MODE_LABEL[activity.transportMode]),
                  activity.travelMinutes !== undefined && formatMinutes(activity.travelMinutes, t),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {activity.notes && <p className="mt-1.5 line-clamp-2 text-[14px] text-fg/80">{activity.notes}</p>}
          </button>
          <button
            type="button"
            onClick={onMenu}
            aria-label={t('common.moreActions')}
            className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
          >
            <Ellipsis className="size-5" aria-hidden />
          </button>
        </div>
        {(overlapsWith?.length || skipped || activity.activityType || place || reorder) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-10">
            {skipped && <Badge>{t(ACTIVITY_STATUS_LABEL.skipped)}</Badge>}
            {activity.activityType && !skipped && <Badge tone="primary">{activityTypeLabel(activity.activityType, i18n)}</Badge>}
            {!!overlapsWith?.length && (
              <Badge tone="warning" icon={TriangleAlert}>
                {t('activity.overlap')}
              </Badge>
            )}
            <MapsButton place={place} kind="directions" mode={activity.transportMode} variant="secondary" />
            {reorder && (
              <span className="ml-auto flex gap-1">
                <button type="button" disabled={!reorder.onUp} onClick={reorder.onUp} aria-label={t('common.moveUp')} className="flex size-9 items-center justify-center rounded-lg bg-surface-2 active:bg-line disabled:opacity-30">
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" disabled={!reorder.onDown} onClick={reorder.onDown} aria-label={t('common.moveDown')} className="flex size-9 items-center justify-center rounded-lg bg-surface-2 active:bg-line disabled:opacity-30">
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
