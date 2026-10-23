import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BedDouble, Copy, Ellipsis, Eye, EyeOff, FileText, Landmark, Paperclip, Plane, Share, Ticket, TrainFront, Trash2, Bus, X, type LucideIcon } from 'lucide-react'
import { useOwnerAttachments } from '@/hooks/useData'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useBodyScrollLock } from '@/hooks/useViewport'
import { useI18n } from '@/i18n'
import { formatLocalDateTime } from '@/i18n/format'
import { BOOKING_TYPE_LABEL } from '@/i18n/labels'
import { showToast } from '@/stores/uiStore'
import type { Attachment, Booking, BookingType, Place } from '@/types/entities'
import { cn } from '@/utils/cn'
import { formatBytes, isImageMimeType, shareOrDownloadFile } from '@/utils/files'
import { gmtOffsetLabel, localDateTimeToInstant } from '@/utils/time'
import { formatMinutes } from '../itinerary/ActivityCard'
import { MapsButton } from '../places/MapsLinks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Primitives'
import { bookingDurationMinutes, dayOffset } from './bookingTimes'

export const BOOKING_ICONS: Record<BookingType, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  train: TrainFront,
  transport: Bus,
  attraction: Ticket,
  other: Landmark,
}

function mask(ref: string): string {
  const visible = ref.length > 4 ? 2 : 0
  return `${'•'.repeat(Math.max(4, ref.length - visible))}${ref.slice(ref.length - visible)}`
}

/** Booking reference, masked until tapped so it does not show up in screenshots by accident. */
export function BookingReference({ value, hidden }: { value: string; hidden: boolean }) {
  const { t } = useI18n()
  const [revealed, setRevealed] = useState(!hidden)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(t('booking.refCopied'))
    } catch {
      showToast(t('error.clipboardDenied'), { tone: 'error' })
    }
  }
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 py-1 pr-1 pl-3">
      <span className="text-[12px] text-muted">{t('booking.reference')}</span>
      <span className="ml-1 flex-1 truncate font-mono text-[15px] font-semibold tracking-wider">{revealed ? value : mask(value)}</span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? t('booking.hideRef') : t('booking.showRef')}
        className="flex size-9 items-center justify-center rounded-lg text-muted active:bg-line"
      >
        {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
      {revealed && typeof navigator.clipboard?.writeText === 'function' && (
        <button type="button" onClick={copy} aria-label={t('common.copy')} className="flex size-9 items-center justify-center rounded-lg text-muted active:bg-line">
          <Copy className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

function tzNote(tz: string | undefined, tripTz: string, at: string | undefined): string | null {
  if (!tz || tz === tripTz || !at) return null
  return gmtOffsetLabel(tz, localDateTimeToInstant(at, tz))
}

interface BookingCardProps {
  booking: Booking
  place?: Place
  tripTz: string
  hideRefs: boolean
  onMenu: () => void
  onOpenAttachment: (a: Attachment) => void
}

export function BookingCard({ booking, place, tripTz, hideRefs, onMenu, onOpenAttachment }: BookingCardProps) {
  const { t, locale } = useI18n()
  const attachments = useOwnerAttachments('booking', booking.id) ?? []
  const Icon = BOOKING_ICONS[booking.type]
  const start = booking.startLocalDateTime ? formatLocalDateTime(booking.startLocalDateTime, locale) : null
  const end = booking.endLocalDateTime ? formatLocalDateTime(booking.endLocalDateTime, locale) : null
  const duration = bookingDurationMinutes(booking, tripTz)
  const offset = dayOffset(booking)
  const startTz = tzNote(booking.startTimezone, tripTz, booking.startLocalDateTime)
  const endTz = tzNote(booking.endTimezone, tripTz, booking.endLocalDateTime)
  const isFlight = booking.type === 'flight'
  const isHotel = booking.type === 'hotel'

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] leading-snug font-semibold">{booking.title}</h3>
          <p className="text-[13px] text-muted">
            {[isFlight ? [booking.provider, booking.flightNumber].filter(Boolean).join(' ') : booking.provider, t(BOOKING_TYPE_LABEL[booking.type])]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button type="button" onClick={onMenu} aria-label={t('common.moreActions')} className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2">
          <Ellipsis className="size-5" aria-hidden />
        </button>
      </div>

      {isFlight || booking.origin || booking.destination ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xl leading-none font-bold">{booking.origin || '—'}</p>
            <p className="mt-1.5 text-[15px] font-semibold tabular-nums">{start?.time ?? '--:--'}</p>
            <p className="text-[12px] text-muted">{start?.date}</p>
            {startTz && <p className="text-[11px] text-subtle">{startTz}</p>}
          </div>
          <div className="flex min-w-12 flex-1 flex-col items-center text-[12px] text-subtle">
            {duration !== null && duration >= 0 && <span>{formatMinutes(duration, t)}</span>}
            <span className="my-1 h-px w-full bg-line" />
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-xl leading-none font-bold">{booking.destination || '—'}</p>
            <p className="mt-1.5 text-[15px] font-semibold tabular-nums">
              {end?.time ?? '--:--'}
              {offset > 0 && <sup className="ml-0.5 text-[11px] text-warning">+{offset}</sup>}
            </p>
            <p className="text-[12px] text-muted">{end?.date}</p>
            {endTz && <p className="text-[11px] text-subtle">{endTz}</p>}
          </div>
        </div>
      ) : (
        (start || end) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {start && (
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-[12px] text-muted">{isHotel ? t('booking.checkIn') : t('booking.start')}</p>
                <p className="text-[14px] font-semibold">{start.date}</p>
                <p className="text-[13px] tabular-nums">{start.time}{startTz && <span className="ml-1 text-subtle">{startTz}</span>}</p>
              </div>
            )}
            {end && (
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-[12px] text-muted">{isHotel ? t('booking.checkOut') : t('booking.end')}</p>
                <p className="text-[14px] font-semibold">{end.date}</p>
                <p className="text-[13px] tabular-nums">{end.time}{endTz && <span className="ml-1 text-subtle">{endTz}</span>}</p>
              </div>
            )}
          </div>
        )
      )}
      {isHotel && offset > 0 && <p className="mt-2 text-[13px] text-muted">{t('booking.nights', { n: offset })}</p>}
      {booking.terminal && <p className="mt-2 text-[13px] text-muted">{t('booking.terminal')}: {booking.terminal}</p>}
      {booking.address && <p className="mt-2 text-[13px] text-muted">{booking.address}</p>}
      {booking.notes && <p className="mt-2 text-[14px] whitespace-pre-line text-fg/80">{booking.notes}</p>}
      {booking.bookingReference && (
        <div className="mt-3">
          <BookingReference value={booking.bookingReference} hidden={hideRefs} />
        </div>
      )}
      {(place || attachments.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <MapsButton place={place} kind="directions" />
          <MapsButton place={place} />
          {attachments.map((a) => (
            <button key={a.id} type="button" onClick={() => onOpenAttachment(a)} className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm font-medium active:bg-line">
              <Paperclip className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{a.filename}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

/** In-app viewer for stored documents, with share/save for opening elsewhere. */
export function AttachmentViewer({ attachment, onClose, onDelete }: { attachment: Attachment | null; onClose: () => void; onDelete?: (a: Attachment) => void }) {
  const { t } = useI18n()
  const url = useObjectUrl(attachment?.blob, attachment?.id)
  useBodyScrollLock(!!attachment)
  if (!attachment) return null
  const image = isImageMimeType(attachment.mimeType)
  const share = async () => {
    const file = new File([attachment.blob], attachment.filename, { type: attachment.mimeType })
    await shareOrDownloadFile(file)
  }
  return createPortal(
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-bg" role="dialog" aria-modal="true" aria-label={attachment.filename}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex size-11 items-center justify-center rounded-full active:bg-surface-2">
          <X className="size-6" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{attachment.filename}</p>
          <p className="text-[12px] text-muted">{formatBytes(attachment.size)}</p>
        </div>
        {onDelete && (
          <button type="button" onClick={() => onDelete(attachment)} aria-label={t('common.delete')} className="flex size-11 items-center justify-center rounded-full text-danger active:bg-danger-soft">
            <Trash2 className="size-5" aria-hidden />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface-2">
        {url &&
          (image ? (
            <img src={url} alt={attachment.filename} className="mx-auto h-auto max-w-full" />
          ) : attachment.mimeType === 'application/pdf' ? (
            <iframe src={url} title={attachment.filename} className="size-full min-h-[60dvh] border-0 bg-white" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
              <FileText className="size-10" aria-hidden />
              {attachment.filename}
            </div>
          ))}
      </div>
      <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <Button block icon={Share} variant="secondary" onClick={() => void share()}>
          {t('booking.shareFile')}
        </Button>
      </div>
    </div>,
    document.body,
  )
}

export function AttachmentChip({ name, size, onRemove }: { name: string; size: number; onRemove: () => void }) {
  const { t } = useI18n()
  return (
    <div className={cn('flex min-h-12 items-center gap-2 rounded-xl border border-line px-3')}>
      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[14px]">{name}</span>
      <span className="text-[12px] text-subtle">{formatBytes(size)}</span>
      <button type="button" onClick={onRemove} aria-label={t('common.remove')} className="flex size-9 items-center justify-center rounded-full text-muted active:bg-surface-2">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
