import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n'
import { formatDate } from '@/i18n/format'
import type { TripDay } from '@/types/entities'
import { cn } from '@/utils/cn'

interface DaySelectorProps {
  days: TripDay[]
  selectedId: string
  today: string
  onSelect: (day: TripDay) => void
}

/** Horizontal, swipeable day picker; keeps the selected day in view. */
export function DaySelector({ days, selectedId, today, onSelect }: DaySelectorProps) {
  const { t, locale } = useI18n()
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  return (
    <div role="tablist" aria-label={t('itinerary.days')} className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1">
      {days.map((day) => {
        const selected = day.id === selectedId
        const isToday = day.date === today
        return (
          <button
            key={day.id}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(day)}
            className={cn(
              'relative flex w-[68px] shrink-0 snap-center flex-col items-center rounded-2xl border py-2 transition-colors',
              selected ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-fg active:bg-surface-2',
            )}
          >
            <span className={cn('text-[11px] font-medium', selected ? 'text-primary-fg/80' : 'text-muted')}>
              {t('itinerary.dayShort', { n: day.dayOrder })}
            </span>
            <span className="text-[19px] leading-tight font-bold tabular-nums">{Number(day.date.slice(8, 10))}</span>
            <span className={cn('text-[11px]', selected ? 'text-primary-fg/80' : 'text-muted')}>{formatDate(day.date, locale, 'weekdayShort')}</span>
            {isToday && <span className={cn('absolute top-1.5 right-1.5 size-1.5 rounded-full', selected ? 'bg-primary-fg' : 'bg-success')} aria-label={t('itinerary.today')} />}
          </button>
        )
      })}
    </div>
  )
}
