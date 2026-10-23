import { useMemo, useState } from 'react'
import { Pencil, ShieldCheck, Ticket, Trash2 } from 'lucide-react'
import { useTripContext } from '@/app/providers/TripContext'
import { AttachmentViewer, BookingCard } from '@/components/bookings/BookingCards'
import { BookingFormSheet } from '@/components/bookings/BookingFormSheet'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState, Fab, PageLoader, SectionTitle } from '@/components/ui/Primitives'
import { ActionSheet } from '@/components/ui/Sheet'
import { useConfirm } from '@/hooks/useConfirm'
import { useAppSettings, useBookings, usePlaces } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { BOOKING_TYPE_LABEL } from '@/i18n/labels'
import { deleteAttachment } from '@/services/attachmentService'
import { deleteBooking } from '@/services/bookingService'
import { showToast } from '@/stores/uiStore'
import { BOOKING_TYPES, type Attachment, type Booking, type BookingType } from '@/types/entities'

export function BookingsPage() {
  const { t } = useI18n()
  const { trip } = useTripContext()
  const bookings = useBookings(trip.id, trip.timezone)
  const places = usePlaces(trip.id)
  const settings = useAppSettings()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Booking | BookingType | null>(null)
  const [menuBooking, setMenuBooking] = useState<Booking | null>(null)
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places])

  if (!bookings || !places || !settings) return <PageLoader />

  const groups = BOOKING_TYPES.map((type) => ({ type, items: bookings.filter((b) => b.type === type) })).filter((g) => g.items.length)

  const remove = async (b: Booking) => {
    if (await confirm({ title: t('booking.deleteTitle'), message: b.title, confirmLabel: t('common.delete'), danger: true })) {
      await deleteBooking(b.id)
      showToast(t('booking.deleted'))
    }
  }

  const removeFile = async (a: Attachment) => {
    if (await confirm({ title: t('booking.deleteFileTitle'), message: a.filename, confirmLabel: t('common.delete'), danger: true })) {
      await deleteAttachment(a.id)
      setViewing(null)
    }
  }

  return (
    <>
      <PageHeader title={t('bookings.title')} subtitle={trip.name} back={`/trip/${trip.id}/more`} />
      <PageBody withFab>
        {bookings.length === 0 ? (
          <EmptyState icon={Ticket} title={t('bookings.emptyTitle')} message={t('bookings.emptyMessage')}>
            <Button onClick={() => setEditing('flight')}>{t('bookings.addFlight')}</Button>
            <Button variant="secondary" onClick={() => setEditing('hotel')}>
              {t('bookings.addHotel')}
            </Button>
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-7">
            {settings.hideBookingRefs && (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <ShieldCheck className="size-4 shrink-0" aria-hidden />
                {t('bookings.refsHidden')}
              </p>
            )}
            {groups.map((g) => (
              <section key={g.type}>
                <SectionTitle>
                  {t(BOOKING_TYPE_LABEL[g.type])} · {g.items.length}
                </SectionTitle>
                <ul className="flex flex-col gap-3">
                  {g.items.map((b) => (
                    <li key={b.id}>
                      <BookingCard
                        booking={b}
                        place={b.placeId ? placeById.get(b.placeId) : undefined}
                        tripTz={trip.timezone}
                        hideRefs={settings.hideBookingRefs}
                        onMenu={() => setMenuBooking(b)}
                        onOpenAttachment={setViewing}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PageBody>
      <Fab label={t('bookings.add')} onClick={() => setEditing('flight')} />
      <BookingFormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        trip={trip}
        places={places}
        booking={typeof editing === 'object' ? editing : null}
        defaultType={typeof editing === 'string' ? editing : undefined}
      />
      <ActionSheet
        open={!!menuBooking}
        onClose={() => setMenuBooking(null)}
        title={menuBooking?.title}
        actions={
          menuBooking
            ? [
                { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing(menuBooking) },
                { label: t('common.delete'), icon: Trash2, tone: 'danger', onSelect: () => void remove(menuBooking) },
              ]
            : []
        }
      />
      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} onDelete={(a) => void removeFile(a)} />
    </>
  )
}
